import { FILE_TYPE } from "@/media/file-type";
import { isMLSupported, mlStatusSnapshot } from "@/new/photos/services/ml";
import type { Person } from "@/new/photos/services/ml/people";
import { EnteFile } from "@/new/photos/types/file";
import { isDesktop } from "@/next/app";
import log from "@/next/log";
import * as chrono from "chrono-node";
import { t } from "i18next";
import { Collection } from "types/collection";
import { EntityType, LocationTag, LocationTagData } from "types/entity";
import {
    ClipSearchScores,
    DateValue,
    Search,
    SearchOption,
    Suggestion,
    SuggestionType,
} from "types/search";
import ComlinkSearchWorker from "utils/comlink/ComlinkSearchWorker";
import { getUniqueFiles } from "utils/file";
import { getFormattedDate } from "utils/search";
import { getLatestEntities } from "./entityService";
import locationSearchService, { City } from "./locationSearchService";

const DIGITS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

export const getDefaultOptions = async () => {
    return [
        await getMLStatusSuggestion(),
        ...(await convertSuggestionsToOptions(await getAllPeopleSuggestion())),
    ].filter((t) => !!t);
};

export const getAutoCompleteSuggestions =
    (files: EnteFile[], collections: Collection[]) =>
    async (searchPhrase: string): Promise<SearchOption[]> => {
        try {
            searchPhrase = searchPhrase.trim().toLowerCase();
            if (!searchPhrase?.length) {
                return [];
            }
            const suggestions: Suggestion[] = [
                await getClipSuggestion(searchPhrase),
                ...getFileTypeSuggestion(searchPhrase),
                ...getHolidaySuggestion(searchPhrase),
                ...getYearSuggestion(searchPhrase),
                ...getDateSuggestion(searchPhrase),
                ...getCollectionSuggestion(searchPhrase, collections),
                getFileNameSuggestion(searchPhrase, files),
                getFileCaptionSuggestion(searchPhrase, files),
                ...(await getLocationSuggestions(searchPhrase)),
            ].filter((suggestion) => !!suggestion);

            return convertSuggestionsToOptions(suggestions);
        } catch (e) {
            log.error("getAutoCompleteSuggestions failed", e);
            return [];
        }
    };

async function convertSuggestionsToOptions(
    suggestions: Suggestion[],
): Promise<SearchOption[]> {
    const searchWorker = await ComlinkSearchWorker.getInstance();
    const previewImageAppendedOptions: SearchOption[] = [];
    for (const suggestion of suggestions) {
        const searchQuery = convertSuggestionToSearchQuery(suggestion);
        const resultFiles = getUniqueFiles(
            await searchWorker.search(searchQuery),
        );
        if (searchQuery?.clip) {
            resultFiles.sort((a, b) => {
                const aScore = searchQuery.clip.get(a.id);
                const bScore = searchQuery.clip.get(b.id);
                return bScore - aScore;
            });
        }
        if (resultFiles.length) {
            previewImageAppendedOptions.push({
                ...suggestion,
                fileCount: resultFiles.length,
                previewFiles: resultFiles.slice(0, 3),
            });
        }
    }
    return previewImageAppendedOptions;
}
function getFileTypeSuggestion(searchPhrase: string): Suggestion[] {
    return [
        {
            label: t("IMAGE"),
            value: FILE_TYPE.IMAGE,
            type: SuggestionType.FILE_TYPE,
        },
        {
            label: t("VIDEO"),
            value: FILE_TYPE.VIDEO,
            type: SuggestionType.FILE_TYPE,
        },
        {
            label: t("LIVE_PHOTO"),
            value: FILE_TYPE.LIVE_PHOTO,
            type: SuggestionType.FILE_TYPE,
        },
    ].filter((suggestion) =>
        suggestion.label.toLowerCase().includes(searchPhrase),
    );
}

function getHolidaySuggestion(searchPhrase: string): Suggestion[] {
    return [
        {
            label: t("CHRISTMAS"),
            value: { month: 11, date: 25 },
            type: SuggestionType.DATE,
        },
        {
            label: t("CHRISTMAS_EVE"),
            value: { month: 11, date: 24 },
            type: SuggestionType.DATE,
        },
        {
            label: t("NEW_YEAR"),
            value: { month: 0, date: 1 },
            type: SuggestionType.DATE,
        },
        {
            label: t("NEW_YEAR_EVE"),
            value: { month: 11, date: 31 },
            type: SuggestionType.DATE,
        },
    ].filter((suggestion) =>
        suggestion.label.toLowerCase().includes(searchPhrase),
    );
}

function getYearSuggestion(searchPhrase: string): Suggestion[] {
    if (searchPhrase.length === 4) {
        try {
            const year = parseInt(searchPhrase);
            if (year >= 1970 && year <= new Date().getFullYear()) {
                return [
                    {
                        label: searchPhrase,
                        value: { year },
                        type: SuggestionType.DATE,
                    },
                ];
            }
        } catch (e) {
            log.error("getYearSuggestion failed", e);
        }
    }
    return [];
}

export async function getAllPeopleSuggestion(): Promise<Array<Suggestion>> {
    try {
        const people = await getAllPeople(200);
        return people.map((person) => ({
            label: person.name,
            type: SuggestionType.PERSON,
            value: person,
            hide: true,
        }));
    } catch (e) {
        log.error("getAllPeopleSuggestion failed", e);
        return [];
    }
}

export async function getMLStatusSuggestion(): Promise<Suggestion> {
    if (!isMLSupported) return undefined;

    const status = mlStatusSnapshot();

    if (!status || status.phase == "disabled" || status.phase == "paused")
        return undefined;

    let label: string;
    switch (status.phase) {
        case "scheduled":
            label = t("INDEXING_SCHEDULED");
            break;
        case "indexing":
            label = t("ANALYZING_PHOTOS", { indexStatus: status });
            break;
        case "clustering":
            label = t("INDEXING_PEOPLE", { indexStatus: status });
            break;
        case "done":
            label = t("INDEXING_DONE", { indexStatus: status });
            break;
    }

    return {
        label,
        type: SuggestionType.INDEX_STATUS,
        value: status,
        hide: true,
    };
}

function getDateSuggestion(searchPhrase: string): Suggestion[] {
    const searchedDates = parseHumanDate(searchPhrase);

    return searchedDates.map((searchedDate) => ({
        type: SuggestionType.DATE,
        value: searchedDate,
        label: getFormattedDate(searchedDate),
    }));
}

function getCollectionSuggestion(
    searchPhrase: string,
    collections: Collection[],
): Suggestion[] {
    const collectionResults = searchCollection(searchPhrase, collections);

    return collectionResults.map(
        (searchResult) =>
            ({
                type: SuggestionType.COLLECTION,
                value: searchResult.id,
                label: searchResult.name,
            }) as Suggestion,
    );
}

function getFileNameSuggestion(
    searchPhrase: string,
    files: EnteFile[],
): Suggestion {
    const matchedFiles = searchFilesByName(searchPhrase, files);
    return {
        type: SuggestionType.FILE_NAME,
        value: matchedFiles.map((file) => file.id),
        label: searchPhrase,
    };
}

function getFileCaptionSuggestion(
    searchPhrase: string,
    files: EnteFile[],
): Suggestion {
    const matchedFiles = searchFilesByCaption(searchPhrase, files);
    return {
        type: SuggestionType.FILE_CAPTION,
        value: matchedFiles.map((file) => file.id),
        label: searchPhrase,
    };
}

async function getLocationSuggestions(searchPhrase: string) {
    const locationTagResults = await searchLocationTag(searchPhrase);
    const locationTagSuggestions = locationTagResults.map(
        (locationTag) =>
            ({
                type: SuggestionType.LOCATION,
                value: locationTag.data,
                label: locationTag.data.name,
            }) as Suggestion,
    );
    const locationTagNames = new Set(
        locationTagSuggestions.map((result) => result.label),
    );

    const citySearchResults =
        await locationSearchService.searchCities(searchPhrase);

    const nonConflictingCityResult = citySearchResults.filter(
        (city) => !locationTagNames.has(city.city),
    );

    const citySearchSuggestions = nonConflictingCityResult.map(
        (city) =>
            ({
                type: SuggestionType.CITY,
                value: city,
                label: city.city,
            }) as Suggestion,
    );

    return [...locationTagSuggestions, ...citySearchSuggestions];
}

async function getClipSuggestion(
    searchPhrase: string,
): Promise<Suggestion | undefined> {
    if (!isDesktop) return undefined;

    const clipResults = await searchClip(searchPhrase);
    if (!clipResults) return undefined;
    return {
        type: SuggestionType.CLIP,
        value: clipResults,
        label: searchPhrase,
    };
}

function searchCollection(
    searchPhrase: string,
    collections: Collection[],
): Collection[] {
    return collections.filter((collection) =>
        collection.name.toLowerCase().includes(searchPhrase),
    );
}

function searchFilesByName(searchPhrase: string, files: EnteFile[]) {
    return files.filter(
        (file) =>
            file.id.toString().includes(searchPhrase) ||
            file.metadata.title.toLowerCase().includes(searchPhrase),
    );
}

function searchFilesByCaption(searchPhrase: string, files: EnteFile[]) {
    return files.filter(
        (file) =>
            file.pubMagicMetadata &&
            file.pubMagicMetadata.data.caption
                ?.toLowerCase()
                .includes(searchPhrase),
    );
}

function parseHumanDate(humanDate: string): DateValue[] {
    const date = chrono.parseDate(humanDate);
    const date1 = chrono.parseDate(`${humanDate} 1`);
    if (date !== null) {
        const dates = [
            { month: date.getMonth() },
            { date: date.getDate(), month: date.getMonth() },
        ];
        let reverse = false;
        humanDate.split("").forEach((c) => {
            if (DIGITS.has(c)) {
                reverse = true;
            }
        });
        if (reverse) {
            return dates.reverse();
        }
        return dates;
    }
    if (date1) {
        return [{ month: date1.getMonth() }];
    }
    return [];
}

async function searchLocationTag(searchPhrase: string): Promise<LocationTag[]> {
    const locationTags = await getLatestEntities<LocationTagData>(
        EntityType.LOCATION_TAG,
    );
    const matchedLocationTags = locationTags.filter((locationTag) =>
        locationTag.data.name.toLowerCase().includes(searchPhrase),
    );
    if (matchedLocationTags.length > 0) {
        log.info(
            `Found ${matchedLocationTags.length} location tags for search phrase`,
        );
    }
    return matchedLocationTags;
}

const searchClip = async (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _searchPhrase: string,
): Promise<ClipSearchScores | undefined> => {
    // TODO-ML: clip-test
    return undefined;
    // const matches = await clipMatches(searchPhrase, ensureElectron());
    // log.debug(() => ["clip/scores", matches]);
    // return matches;
};

function convertSuggestionToSearchQuery(option: Suggestion): Search {
    switch (option.type) {
        case SuggestionType.DATE:
            return {
                date: option.value as DateValue,
            };

        case SuggestionType.LOCATION:
            return {
                location: option.value as LocationTagData,
            };

        case SuggestionType.CITY:
            return { city: option.value as City };

        case SuggestionType.COLLECTION:
            return { collection: option.value as number };

        case SuggestionType.FILE_NAME:
            return { files: option.value as number[] };

        case SuggestionType.FILE_CAPTION:
            return { files: option.value as number[] };

        case SuggestionType.PERSON:
            return { person: option.value as Person };

        case SuggestionType.FILE_TYPE:
            return { fileType: option.value as FILE_TYPE };

        case SuggestionType.CLIP:
            return { clip: option.value as ClipSearchScores };
    }
}

async function getAllPeople(limit: number = undefined) {
    let people: Array<Person> = []; // await mlIDbStorage.getAllPeople();
    // await mlPeopleStore.iterate<Person, void>((person) => {
    //     people.push(person);
    // });
    people = people ?? [];
    return people
        .sort((p1, p2) => p2.files.length - p1.files.length)
        .slice(0, limit);
}
