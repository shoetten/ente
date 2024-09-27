import { HTTPError } from "@/base/http";
import type { Location } from "@/base/types";
import type { Collection } from "@/media/collection";
import { fileCreationPhotoDate, fileLocation } from "@/media/file-metadata";
import type { EnteFile } from "@/new/photos/types/file";
import { ensure } from "@/utils/ensure";
import { nullToUndefined } from "@/utils/transform";
import { getPublicMagicMetadataSync } from "@ente/shared/file-metadata";
import type { Component } from "chrono-node";
import * as chrono from "chrono-node";
import { expose } from "comlink";
import { z } from "zod";
import {
    pullUserEntities,
    savedLocationTags,
    type LocationTag,
} from "../user-entity";
import type {
    City,
    LabelledFileType,
    LabelledSearchDateComponents,
    LocalizedSearchData,
    SearchCollectionsAndFiles,
    SearchDateComponents,
    SearchPerson,
    SearchSuggestion,
} from "./types";

/**
 * A web worker that runs the search asynchronously so that the main thread
 * remains responsive.
 */
export class SearchWorker {
    private locationTags: LocationTag[] = [];
    private cities: City[] = [];
    private collectionsAndFiles: SearchCollectionsAndFiles = {
        collections: [],
        files: [],
    };
    private people: SearchPerson[] = [];

    /**
     * Fetch any state we might need when the actual search happens.
     *
     * @param masterKey The user's master key. Web workers do not have access to
     * session storage so this key needs to be passed to us explicitly.
     */
    async sync(masterKey: Uint8Array) {
        return Promise.all([
            pullUserEntities("location", masterKey)
                .then(() => savedLocationTags())
                .then((ts) => (this.locationTags = ts)),
            fetchCities().then((cs) => (this.cities = cs)),
        ]);
    }

    /**
     * Set the collections and files that we should search across.
     */
    setCollectionsAndFiles(cf: SearchCollectionsAndFiles) {
        this.collectionsAndFiles = cf;
    }

    /**
     * Set the (named) people that we should search across.
     */
    setPeople(people: SearchPerson[]) {
        this.people = people;
    }

    /**
     * Convert a search string into a list of {@link SearchSuggestion}s.
     */
    suggestionsForString(
        s: string,
        searchString: string,
        localizedSearchData: LocalizedSearchData,
    ) {
        return suggestionsForString(
            s,
            // Case insensitive word prefix match, considering underscores also
            // as a word separator.
            new RegExp("(\\b|_)" + s, "i"),
            searchString,
            this.collectionsAndFiles,
            this.people,
            localizedSearchData,
            this.locationTags,
            this.cities,
        );
    }

    /**
     * Return {@link EnteFile}s that satisfy the given {@link suggestion}.
     */
    filterSearchableFiles(suggestion: SearchSuggestion) {
        return filterSearchableFiles(
            this.collectionsAndFiles.files,
            suggestion,
        );
    }

    /**
     * Batched variant of {@link filterSearchableFiles}.
     */
    filterSearchableFilesMulti(suggestions: SearchSuggestion[]) {
        const files = this.collectionsAndFiles.files;
        return suggestions
            .map((sg) => [filterSearchableFiles(files, sg), sg] as const)
            .filter(([files]) => files.length);
    }
}

expose(SearchWorker);

/**
 * @param s The normalized form of {@link searchString}.
 * @param searchString The original search string.
 */
const suggestionsForString = (
    s: string,
    re: RegExp,
    searchString: string,
    { collections, files }: SearchCollectionsAndFiles,
    people: SearchPerson[],
    { locale, holidays, labelledFileTypes }: LocalizedSearchData,
    locationTags: LocationTag[],
    cities: City[],
): [SearchSuggestion[], SearchSuggestion[]] => [
    [peopleSuggestions(re, people)].flat(),
    // . <-- clip suggestions will be inserted here by our caller.
    [
        fileTypeSuggestions(re, labelledFileTypes),
        dateSuggestions(s, re, locale, holidays),
        locationSuggestions(re, locationTags, cities),
        collectionSuggestions(re, collections),
        fileNameSuggestion(s, re, searchString, files),
        fileCaptionSuggestion(re, searchString, files),
    ].flat(),
];

const collectionSuggestions = (
    re: RegExp,
    collections: Collection[],
): SearchSuggestion[] =>
    collections
        .filter((c) => re.test(c.name))
        .map(({ id, name }) => ({
            type: "collection",
            collectionID: id,
            label: name,
        }));

const fileTypeSuggestions = (
    re: RegExp,
    labelledFileTypes: LabelledFileType[],
): SearchSuggestion[] =>
    labelledFileTypes
        .filter(({ label }) => re.test(label))
        .map(({ fileType, label }) => ({ type: "fileType", fileType, label }));

const fileNameSuggestion = (
    s: string,
    re: RegExp,
    searchString: string,
    files: EnteFile[],
): SearchSuggestion[] => {
    // Convert the search string to a number. This allows searching a file by
    // its exact (integral) ID.
    const sn = Number(s) || undefined;

    const fileIDs = files
        .filter(({ id, metadata }) => id === sn || re.test(metadata.title))
        .map((f) => f.id);

    return fileIDs.length
        ? [{ type: "fileName", fileIDs, label: searchString }]
        : [];
};

const fileCaptionSuggestion = (
    re: RegExp,
    searchString: string,
    files: EnteFile[],
): SearchSuggestion[] => {
    const fileIDs = files
        .filter((file) => {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            const caption = file.pubMagicMetadata?.data?.caption;
            return caption && re.test(caption);
        })
        .map((f) => f.id);

    return fileIDs.length
        ? [{ type: "fileCaption", fileIDs, label: searchString }]
        : [];
};

const peopleSuggestions = (
    re: RegExp,
    people: SearchPerson[],
): SearchSuggestion[] =>
    people
        .filter((sp) => re.test(sp.name))
        .map((sp) => ({ type: "person", person: sp.person, label: sp.name }));

const dateSuggestions = (
    s: string,
    re: RegExp,
    locale: string,
    holidays: LabelledSearchDateComponents[],
): SearchSuggestion[] =>
    parseDateComponents(s, re, locale, holidays).map(
        ({ components, label }) => ({
            type: "date",
            dateComponents: components,
            label,
        }),
    );

/**
 * Try to parse an arbitrary search string into sets of date components.
 *
 * e.g. "December 2022" will be parsed into a
 *
 *     [(year 2022, month 12, day undefined)]
 *
 * while "22 December 2022" will be parsed into
 *
 *     [(year 2022, month 12, day 22)]
 *
 * In addition, also return a formatted representation of the "best" guess at
 * the date that was intended by the search string.
 */
const parseDateComponents = (
    s: string,
    re: RegExp,
    locale: string,
    holidays: LabelledSearchDateComponents[],
): LabelledSearchDateComponents[] =>
    [
        parseChrono(s, locale),
        parseYearComponents(s),
        holidays.filter((h) => re.test(h.label)),
    ].flat();

const parseChrono = (
    s: string,
    locale: string,
): LabelledSearchDateComponents[] =>
    chrono
        .parse(s)
        .map((result) => {
            const p = result.start;
            const component = (s: Component) =>
                p.isCertain(s) ? nullToUndefined(p.get(s)) : undefined;

            const year = component("year");
            const month = component("month");
            const day = component("day");
            const weekday = component("weekday");
            const hour = component("hour");

            if (!year && !month && !day && !weekday && !hour) return undefined;
            const components = { year, month, day, weekday, hour };

            const format: Intl.DateTimeFormatOptions = {};
            if (year) format.year = "numeric";
            if (month) format.month = "long";
            if (day) format.day = "numeric";
            if (weekday) format.weekday = "long";
            if (hour) {
                format.hour = "numeric";
                format.dayPeriod = "short";
            }

            const formatter = new Intl.DateTimeFormat(locale, format);
            const label = formatter.format(p.date());
            return { components, label };
        })
        .filter((x) => x !== undefined);

/** chrono does not parse years like "2024", so do it manually. */
const parseYearComponents = (s: string): LabelledSearchDateComponents[] => {
    // s is already trimmed.
    if (s.length == 4) {
        const year = parseInt(s);
        if (year && year <= 9999) {
            const components = { year };
            return [{ components, label: s }];
        }
    }
    return [];
};

/**
 * Zod schema describing world_cities.json.
 *
 * The entries also have a country field which we don't currently use.
 */
const RemoteWorldCities = z.object({
    data: z.array(
        z.object({
            city: z.string(),
            lat: z.number(),
            lng: z.number(),
        }),
    ),
});

const fetchCities = async () => {
    const res = await fetch("https://static.ente.io/world_cities.json");
    if (!res.ok) throw new HTTPError(res);
    return RemoteWorldCities.parse(await res.json()).data.map(
        ({ city, lat, lng }) => ({ name: city, latitude: lat, longitude: lng }),
    );
};

const locationSuggestions = (
    re: RegExp,
    locationTags: LocationTag[],
    cities: City[],
): SearchSuggestion[] => {
    const matchingLocationTags = locationTags.filter((t) => re.test(t.name));

    const matchingLocationTagLNames = new Set(
        matchingLocationTags.map((t) => t.name.toLowerCase()),
    );

    const matchingCities = cities
        .filter((c) => re.test(c.name))
        .filter((c) => !matchingLocationTagLNames.has(c.name.toLowerCase()));

    return [
        matchingLocationTags.map(
            (locationTag): SearchSuggestion => ({
                type: "location",
                locationTag,
                label: locationTag.name,
            }),
        ),
        matchingCities.map(
            (city): SearchSuggestion => ({
                type: "city",
                city,
                label: city.name,
            }),
        ),
    ].flat();
};

const filterSearchableFiles = (
    files: EnteFile[],
    suggestion: SearchSuggestion,
) =>
    sortMatchesIfNeeded(
        files.filter((f) => isMatchingFile(f, suggestion)),
        suggestion,
    );

/**
 * Return true if file satisfies the given {@link query}.
 */
const isMatchingFile = (file: EnteFile, suggestion: SearchSuggestion) => {
    switch (suggestion.type) {
        case "collection":
            return suggestion.collectionID === file.collectionID;

        case "fileType":
            return suggestion.fileType === file.metadata.fileType;

        case "fileName":
            return suggestion.fileIDs.includes(file.id);

        case "fileCaption":
            return suggestion.fileIDs.includes(file.id);

        case "date":
            return isDateComponentsMatch(
                suggestion.dateComponents,
                fileCreationPhotoDate(file, getPublicMagicMetadataSync(file)),
            );

        case "location": {
            const location = fileLocation(file);
            if (!location) return false;

            return isInsideLocationTag(location, suggestion.locationTag);
        }

        case "city": {
            const location = fileLocation(file);
            if (!location) return false;

            return isInsideCity(location, suggestion.city);
        }

        case "clip":
            return suggestion.clipScoreForFileID.has(file.id);

        case "person":
            return suggestion.person.fileIDs.includes(file.id);
    }
};

const isDateComponentsMatch = (
    { year, month, day, weekday, hour }: SearchDateComponents,
    date: Date,
) => {
    // Components are guaranteed to have at least one attribute present, so
    // start by assuming true.
    let match = true;

    if (year) match = date.getFullYear() == year;
    // JS getMonth is 0-indexed.
    if (match && month) match = date.getMonth() + 1 == month;
    if (match && day) match = date.getDate() == day;
    if (match && weekday) match = date.getDay() == weekday;
    if (match && hour) match = date.getHours() == hour;

    return match;
};

const defaultCityRadius = 10;
const kmsPerDegree = 111.16;

const isInsideLocationTag = (location: Location, locationTag: LocationTag) =>
    // See: [Note: strict mode migration]
    //
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    isWithinRadius(location, locationTag.centerPoint, locationTag.radius);

const isInsideCity = (location: Location, city: City) =>
    isWithinRadius(location, city, defaultCityRadius);

const isWithinRadius = (
    location: Location,
    center: Location,
    radius: number,
) => {
    const a = (radius * radiusScaleFactor(center.latitude)) / kmsPerDegree;
    const b = radius / kmsPerDegree;
    const x = center.latitude - location.latitude;
    const y = center.longitude - location.longitude;
    return (x * x) / (a * a) + (y * y) / (b * b) <= 1;
};

/**
 * A latitude specific scaling factor to apply to the radius of a location
 * search.
 *
 * The area bounded by the location tag becomes more elliptical with increase in
 * the magnitude of the latitude on the cartesian plane. When latitude is 0
 * degrees, the ellipse is a circle with a = b = r. When latitude incrases, the
 * major axis (a) has to be scaled by the secant of the latitude.
 */
const radiusScaleFactor = (lat: number) => 1 / Math.cos(lat * (Math.PI / 180));

/**
 * Sort the files if necessary.
 *
 * Currently, only the CLIP results are sorted (by their score), in the other
 * cases the files are displayed chronologically (when displaying them in search
 * results) or arbitrarily (when showing them in the search option preview).
 */
const sortMatchesIfNeeded = (
    files: EnteFile[],
    suggestion: SearchSuggestion,
) => {
    if (suggestion.type != "clip") return files;
    // Sort CLIP matches by their corresponding scores.
    const score = ({ id }: EnteFile) =>
        ensure(suggestion.clipScoreForFileID.get(id));
    return files.sort((a, b) => score(b) - score(a));
};
