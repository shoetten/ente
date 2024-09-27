/**
 * @file types shared between the main thread interface to search (`index.ts`)
 * and the search worker that does the actual searching (`worker.ts`).
 */

import type { Location } from "@/base/types";
import type { Collection } from "@/media/collection";
import { FileType } from "@/media/file-type";
import type { Person } from "@/new/photos/services/ml/people";
import type { EnteFile } from "@/new/photos/types/file";
import type { LocationTag } from "../user-entity";

/**
 * A search suggestion.
 *
 * These (wrapped up in {@link SearchOption}s) are shown in the search results
 * dropdown, and can also be used to filter the list of files that are shown.
 */
export type SearchSuggestion = { label: string } & (
    | { type: "collection"; collectionID: number }
    | { type: "fileType"; fileType: FileType }
    | { type: "fileName"; fileIDs: number[] }
    | { type: "fileCaption"; fileIDs: number[] }
    | { type: "date"; dateComponents: SearchDateComponents }
    | { type: "location"; locationTag: LocationTag }
    | { type: "city"; city: City }
    | { type: "clip"; clipScoreForFileID: Map<number, number> }
    | { type: "person"; person: Person }
);

/**
 * An option shown in the the search bar's select dropdown.
 *
 * The {@link SearchOption} wraps a {@link SearchSuggestion} with some metadata
 * used when showing a corresponding entry in the dropdown, and in the results
 * header.
 *
 * If the user selects the option, then we will re-run the search using the
 * {@link suggestion} to filter the list of files shown to the user.
 */
export interface SearchOption {
    suggestion: SearchSuggestion;
    fileCount: number;
    previewFiles: EnteFile[];
}

/**
 * The collections and files over which we should search.
 */
export interface SearchCollectionsAndFiles {
    collections: Collection[];
    files: EnteFile[];
}

export interface LabelledSearchDateComponents {
    components: SearchDateComponents;
    label: string;
}

export interface LabelledFileType {
    fileType: FileType;
    label: string;
}

/**
 * Various bits of static but locale specific data that the search worker needs
 * during searching.
 */
export interface LocalizedSearchData {
    locale: string;
    holidays: LabelledSearchDateComponents[];
    labelledFileTypes: LabelledFileType[];
}

/**
 * A parsed version of a potential natural language date time string.
 *
 * All attributes which were parsed will be set. The type doesn't enforce this,
 * but it is guaranteed that at least one attribute will be present.
 */
export interface SearchDateComponents {
    /**
     * The year, if the search string specified one. e.g. `2024`.
     */
    year?: number;
    /**
     * The month (1 to 12, with December being 12), if the search string
     * specified one.
     */
    month?: number;
    /**
     * The day of the month (1 to 31), if the search string specified one.
     */
    day?: number;
    /**
     * The day of the week (0 to 6, with Sunday being 0), if the search string
     * specified one.
     */
    weekday?: number;
    /**
     * The hour of the day (0 to 23, with 0 as midnight), if the search string
     * specified one.
     */
    hour?: number;
}

/**
 * A city as identified by a static dataset.
 *
 * Each city is represented by its latitude and longitude. The dataset does not
 * have information about the city's estimated radius.
 */
export type City = Location & {
    /** Name of the city. */
    name: string;
};

export type NamedPerson = Person & {
    name: string;
};

/**
 * What we want is NamedPerson, but I can't get it to TypeScript to accept it in
 * our usage contexts. This is a workaround.
 */
export interface SearchPerson {
    person: Person;
    name: string;
}
