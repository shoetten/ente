import { stashRedirect } from "@/accounts/services/redirect";
import { NavbarBase } from "@/base/components/Navbar";
import { useIsMobileWidth } from "@/base/hooks";
import log from "@/base/log";
import type { Collection } from "@/media/collection";
import {
    SearchBar,
    type SearchBarProps,
} from "@/new/photos/components/SearchBar";
import { WhatsNew } from "@/new/photos/components/WhatsNew";
import { shouldShowWhatsNew } from "@/new/photos/services/changelog";
import downloadManager from "@/new/photos/services/download";
import {
    getLocalFiles,
    getLocalTrashedFiles,
} from "@/new/photos/services/files";
import { wipHasSwitchedOnceCmpAndSet } from "@/new/photos/services/ml";
import type { Person } from "@/new/photos/services/ml/cgroups";
import {
    filterSearchableFiles,
    setSearchCollectionsAndFiles,
} from "@/new/photos/services/search";
import type { SearchOption } from "@/new/photos/services/search/types";
import { EnteFile } from "@/new/photos/types/file";
import { mergeMetadata } from "@/new/photos/utils/file";
import {
    CenteredFlex,
    FlexWrapper,
    HorizontalFlex,
} from "@ente/shared/components/Container";
import EnteSpinner from "@ente/shared/components/EnteSpinner";
import { PHOTOS_PAGES as PAGES } from "@ente/shared/constants/pages";
import { getRecoveryKey } from "@ente/shared/crypto/helpers";
import { CustomError } from "@ente/shared/error";
import { useFileInput } from "@ente/shared/hooks/useFileInput";
import useMemoSingleThreaded from "@ente/shared/hooks/useMemoSingleThreaded";
import { LS_KEYS, getData } from "@ente/shared/storage/localStorage";
import {
    getToken,
    isFirstLogin,
    justSignedUp,
    setIsFirstLogin,
    setJustSignedUp,
} from "@ente/shared/storage/localStorage/helpers";
import {
    SESSION_KEYS,
    clearKeys,
    getKey,
} from "@ente/shared/storage/sessionStorage";
import type { User } from "@ente/shared/user/types";
import ArrowBack from "@mui/icons-material/ArrowBack";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import type { ButtonProps, IconButtonProps } from "@mui/material";
import { Box, Button, IconButton, Typography, styled } from "@mui/material";
import AuthenticateUserModal from "components/AuthenticateUserModal";
import Collections from "components/Collections";
import { CollectionInfo } from "components/Collections/CollectionInfo";
import CollectionNamer, {
    CollectionNamerAttributes,
} from "components/Collections/CollectionNamer";
import CollectionSelector, {
    CollectionSelectorAttributes,
} from "components/Collections/CollectionSelector";
import { CollectionInfoBarWrapper } from "components/Collections/styledComponents";
import ExportModal from "components/ExportModal";
import {
    FilesDownloadProgress,
    FilesDownloadProgressAttributes,
} from "components/FilesDownloadProgress";
import FixCreationTime, {
    FixCreationTimeAttributes,
} from "components/FixCreationTime";
import FullScreenDropZone from "components/FullScreenDropZone";
import GalleryEmptyState from "components/GalleryEmptyState";
import { LoadingOverlay } from "components/LoadingOverlay";
import PhotoFrame from "components/PhotoFrame";
import { ITEM_TYPE, TimeStampListItem } from "components/PhotoList";
import Sidebar from "components/Sidebar";
import { type UploadTypeSelectorIntent } from "components/Upload/UploadTypeSelector";
import Uploader from "components/Upload/Uploader";
import { UploadSelectorInputs } from "components/UploadSelectorInputs";
import PlanSelector from "components/pages/gallery/PlanSelector";
import SelectedFileOptions from "components/pages/gallery/SelectedFileOptions";
import { t } from "i18next";
import { useRouter } from "next/router";
import { AppContext } from "pages/_app";
import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useDropzone } from "react-dropzone";
import {
    constructEmailList,
    constructUserIDToEmailMap,
    createAlbum,
    getAllLatestCollections,
    getAllLocalCollections,
    getCollectionSummaries,
    getFavItemIds,
    getHiddenItemsSummary,
    getSectionSummaries,
} from "services/collectionService";
import { syncFiles } from "services/fileService";
import { preFileInfoSync, sync } from "services/sync";
import { syncTrash } from "services/trashService";
import uploadManager from "services/upload/uploadManager";
import { isTokenValid } from "services/userService";
import { CollectionSummaries, CollectionSummaryType } from "types/collection";
import {
    GalleryContextType,
    SelectedState,
    SetFilesDownloadProgressAttributes,
    SetFilesDownloadProgressAttributesCreator,
} from "types/gallery";
import { FamilyData } from "types/user";
import { checkSubscriptionPurchase } from "utils/billing";
import {
    ALL_SECTION,
    ARCHIVE_SECTION,
    COLLECTION_OPS_TYPE,
    HIDDEN_ITEMS_SECTION,
    TRASH_SECTION,
    constructCollectionNameMap,
    getArchivedCollections,
    getDefaultHiddenCollectionIDs,
    getSelectedCollection,
    handleCollectionOps,
    hasNonSystemCollections,
    splitNormalAndHiddenCollections,
} from "utils/collection";
import {
    FILE_OPS_TYPE,
    constructFileToCollectionMap,
    getSelectedFiles,
    getUniqueFiles,
    handleFileOps,
    sortFiles,
} from "utils/file";
import { isArchivedFile } from "utils/magicMetadata";
import { getSessionExpiredMessage } from "utils/ui";
import { getLocalFamilyData } from "utils/user/family";

const SYNC_INTERVAL_IN_MICROSECONDS = 1000 * 60 * 5; // 5 minutes

export const DeadCenter = styled("div")`
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    flex-direction: column;
`;

const defaultGalleryContext: GalleryContextType = {
    showPlanSelectorModal: () => null,
    setActiveCollectionID: () => null,
    syncWithRemote: () => null,
    setBlockingLoad: () => null,
    setIsInSearchMode: () => null,
    photoListHeader: null,
    openExportModal: () => null,
    authenticateUser: () => null,
    user: null,
    userIDToEmailMap: null,
    emailList: null,
    openHiddenSection: () => null,
    isClipSearchResult: null,
    selectedFile: null,
    setSelectedFiles: () => null,
};

export const GalleryContext = createContext<GalleryContextType>(
    defaultGalleryContext,
);

export default function Gallery() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [familyData, setFamilyData] = useState<FamilyData>(null);
    const [collections, setCollections] = useState<Collection[]>(null);
    const [hiddenCollections, setHiddenCollections] =
        useState<Collection[]>(null);
    const [defaultHiddenCollectionIDs, setDefaultHiddenCollectionIDs] =
        useState<Set<number>>();
    const [files, setFiles] = useState<EnteFile[]>(null);
    const [hiddenFiles, setHiddenFiles] = useState<EnteFile[]>(null);
    const [trashedFiles, setTrashedFiles] = useState<EnteFile[]>(null);

    const [favItemIds, setFavItemIds] = useState<Set<number>>();

    const [isFirstLoad, setIsFirstLoad] = useState(false);
    const [selected, setSelected] = useState<SelectedState>({
        ownCount: 0,
        count: 0,
        collectionID: 0,
    });
    const [planModalView, setPlanModalView] = useState(false);
    const [blockingLoad, setBlockingLoad] = useState(false);
    const [collectionSelectorAttributes, setCollectionSelectorAttributes] =
        useState<CollectionSelectorAttributes>(null);
    const [collectionSelectorView, setCollectionSelectorView] = useState(false);
    const [collectionNamerAttributes, setCollectionNamerAttributes] =
        useState<CollectionNamerAttributes>(null);
    const [collectionNamerView, setCollectionNamerView] = useState(false);
    const [shouldDisableDropzone, setShouldDisableDropzone] = useState(false);
    const [isPhotoSwipeOpen, setIsPhotoSwipeOpen] = useState(false);
    const [openWhatsNew, setOpenWhatsNew] = useState(false);

    const {
        // A function to call to get the props we should apply to the container,
        getRootProps: getDragAndDropRootProps,
        // ... the props we should apply to the <input> element,
        getInputProps: getDragAndDropInputProps,
        // ... and the files that we got.
        acceptedFiles: dragAndDropFiles,
    } = useDropzone({
        noClick: true,
        noKeyboard: true,
        disabled: shouldDisableDropzone,
    });
    const {
        getInputProps: getFileSelectorInputProps,
        openSelector: openFileSelector,
        selectedFiles: fileSelectorFiles,
    } = useFileInput({
        directory: false,
    });
    const {
        getInputProps: getFolderSelectorInputProps,
        openSelector: openFolderSelector,
        selectedFiles: folderSelectorFiles,
    } = useFileInput({
        directory: true,
    });
    const {
        getInputProps: getZipFileSelectorInputProps,
        openSelector: openZipFileSelector,
        selectedFiles: fileSelectorZipFiles,
    } = useFileInput({
        directory: false,
        accept: ".zip",
    });

    // If we're in "search mode". See: [Note: "search mode"].
    const [isInSearchMode, setIsInSearchMode] = useState(false);
    // The option selected by the user selected from the search bar dropdown.
    const [selectedSearchOption, setSelectedSearchOption] = useState<
        SearchOption | undefined
    >();
    const syncInProgress = useRef(true);
    const syncInterval = useRef<NodeJS.Timeout>();
    const resync = useRef<{ force: boolean; silent: boolean }>();
    // tempDeletedFileIds and tempHiddenFileIds are used to keep track of files that are deleted/hidden in the current session but not yet synced with the server.
    const [tempDeletedFileIds, setTempDeletedFileIds] = useState<Set<number>>(
        new Set<number>(),
    );
    const [tempHiddenFileIds, setTempHiddenFileIds] = useState<Set<number>>(
        new Set<number>(),
    );
    const {
        startLoading,
        finishLoading,
        setDialogMessage,
        logout,
        ...appContext
    } = useContext(AppContext);
    const [collectionSummaries, setCollectionSummaries] =
        useState<CollectionSummaries>();
    const [hiddenCollectionSummaries, setHiddenCollectionSummaries] =
        useState<CollectionSummaries>();
    const [userIDToEmailMap, setUserIDToEmailMap] =
        useState<Map<number, string>>(null);
    const [emailList, setEmailList] = useState<string[]>(null);
    const [activeCollectionID, setActiveCollectionID] =
        useState<number>(undefined);
    const [hiddenFileIds, setHiddenFileIds] = useState<Set<number>>(
        new Set<number>(),
    );
    const [fixCreationTimeView, setFixCreationTimeView] = useState(false);
    const [fixCreationTimeAttributes, setFixCreationTimeAttributes] =
        useState<FixCreationTimeAttributes>(null);

    const [archivedCollections, setArchivedCollections] =
        useState<Set<number>>();

    const showPlanSelectorModal = () => setPlanModalView(true);

    const [uploadTypeSelectorView, setUploadTypeSelectorView] = useState(false);
    const [uploadTypeSelectorIntent, setUploadTypeSelectorIntent] =
        useState<UploadTypeSelectorIntent>("upload");

    const [sidebarView, setSidebarView] = useState(false);

    const closeSidebar = () => setSidebarView(false);
    const openSidebar = () => setSidebarView(true);
    const [photoListHeader, setPhotoListHeader] =
        useState<TimeStampListItem>(null);

    const [exportModalView, setExportModalView] = useState(false);

    const [authenticateUserModalView, setAuthenticateUserModalView] =
        useState(false);

    const onAuthenticateCallback = useRef<() => void>();

    const authenticateUser = (callback: () => void) => {
        onAuthenticateCallback.current = callback;
        setAuthenticateUserModalView(true);
    };
    const closeAuthenticateUserModal = () =>
        setAuthenticateUserModalView(false);

    // `true` if we're displaying the hidden section.
    //
    // - The search bar is replaced by a navbar with a back button.
    // - The collections bar shows only the hidden collections.
    // - The gallery itself shows hidden items.
    const [isInHiddenSection, setIsInHiddenSection] = useState(false);

    // If set, then display files belonging to this person.
    //
    // - The collections bar is replaced with a people bar.
    // - The gallery itself shows files which contain this person.
    const [person, setPerson] = useState<Person | undefined>();

    const [
        filesDownloadProgressAttributesList,
        setFilesDownloadProgressAttributesList,
    ] = useState<FilesDownloadProgressAttributes[]>([]);

    const [isClipSearchResult, setIsClipSearchResult] =
        useState<boolean>(false);

    // Ensure that the keys in local storage are not malformed by verifying that
    // the recoveryKey can be decrypted with the masterKey.
    // Note: This is not bullet-proof.
    const validateKey = async () => {
        try {
            await getRecoveryKey();
            return true;
        } catch (e) {
            logout();
            return false;
        }
    };

    useEffect(() => {
        appContext.showNavBar(true);
        const key = getKey(SESSION_KEYS.ENCRYPTION_KEY);
        const token = getToken();
        if (!key || !token) {
            stashRedirect(PAGES.GALLERY);
            router.push("/");
            return;
        }
        preloadImage("/images/subscription-card-background");
        const electron = globalThis.electron;
        const main = async () => {
            const valid = await validateKey();
            if (!valid) {
                return;
            }
            await downloadManager.init(token);
            setupSelectAllKeyBoardShortcutHandler();
            setActiveCollectionID(ALL_SECTION);
            setIsFirstLoad(isFirstLogin());
            if (justSignedUp()) {
                setPlanModalView(true);
            }
            setIsFirstLogin(false);
            const user = getData(LS_KEYS.USER);
            const familyData = getLocalFamilyData();
            const files = sortFiles(
                mergeMetadata(await getLocalFiles("normal")),
            );
            const hiddenFiles = sortFiles(
                mergeMetadata(await getLocalFiles("hidden")),
            );
            const collections = await getAllLocalCollections();
            const { normalCollections, hiddenCollections } =
                await splitNormalAndHiddenCollections(collections);
            const trashedFiles = await getLocalTrashedFiles();

            setUser(user);
            setFamilyData(familyData);
            setFiles(files);
            setTrashedFiles(trashedFiles);
            setHiddenFiles(hiddenFiles);
            setCollections(normalCollections);
            setHiddenCollections(hiddenCollections);
            await syncWithRemote(true);
            setIsFirstLoad(false);
            setJustSignedUp(false);
            syncInterval.current = setInterval(() => {
                syncWithRemote(false, true);
            }, SYNC_INTERVAL_IN_MICROSECONDS);
            if (electron) {
                electron.onMainWindowFocus(() => syncWithRemote(false, true));
                if (await shouldShowWhatsNew(electron)) setOpenWhatsNew(true);
            }
        };
        main();
        return () => {
            clearInterval(syncInterval.current);
            if (electron) electron.onMainWindowFocus(undefined);
        };
    }, []);

    useEffect(
        () =>
            setSearchCollectionsAndFiles({
                collections: collections ?? [],
                files: getUniqueFiles(files ?? []),
            }),
        [collections, files],
    );

    useEffect(() => {
        if (!user || !files || !collections || !hiddenFiles || !trashedFiles) {
            return;
        }
        setDerivativeState(
            user,
            collections,
            hiddenCollections,
            files,
            trashedFiles,
            hiddenFiles,
        );
    }, [
        collections,
        hiddenCollections,
        files,
        hiddenFiles,
        trashedFiles,
        user,
    ]);

    useEffect(() => {
        if (!collections || !user) {
            return;
        }
        const userIdToEmailMap = constructUserIDToEmailMap(user, collections);
        setUserIDToEmailMap(userIdToEmailMap);
    }, [collections]);

    useEffect(() => {
        if (!user || !collections) {
            return;
        }
        const emailList = constructEmailList(user, collections, familyData);
        setEmailList(emailList);
    }, [user, collections, familyData]);

    useEffect(() => {
        collectionSelectorAttributes && setCollectionSelectorView(true);
    }, [collectionSelectorAttributes]);

    useEffect(() => {
        collectionNamerAttributes && setCollectionNamerView(true);
    }, [collectionNamerAttributes]);
    useEffect(() => {
        fixCreationTimeAttributes && setFixCreationTimeView(true);
    }, [fixCreationTimeAttributes]);

    useEffect(() => {
        if (typeof activeCollectionID === "undefined" || !router.isReady) {
            return;
        }
        let collectionURL = "";
        if (activeCollectionID !== ALL_SECTION) {
            // TODO: Is this URL param even used?
            collectionURL = `?collection=${activeCollectionID}`;
        }
        const href = `/gallery${collectionURL}`;
        router.push(href, undefined, { shallow: true });
    }, [activeCollectionID, router.isReady]);

    useEffect(() => {
        const key = getKey(SESSION_KEYS.ENCRYPTION_KEY);
        if (router.isReady && key) {
            checkSubscriptionPurchase(
                setDialogMessage,
                router,
                setBlockingLoad,
            );
        }
    }, [router.isReady]);

    useEffect(() => {
        if (isInSearchMode && selectedSearchOption) {
            setPhotoListHeader({
                height: 104,
                item: (
                    <SearchResultsHeader
                        selectedOption={selectedSearchOption}
                    />
                ),
                itemType: ITEM_TYPE.HEADER,
            });
        }
    }, [isInSearchMode, selectedSearchOption]);

    const activeCollection = useMemo(() => {
        if (!collections || !hiddenCollections) {
            return null;
        }
        return [...collections, ...hiddenCollections].find(
            (collection) => collection.id === activeCollectionID,
        );
    }, [collections, activeCollectionID]);

    const filteredData = useMemoSingleThreaded(async (): Promise<
        EnteFile[]
    > => {
        if (
            !files ||
            !user ||
            !trashedFiles ||
            !hiddenFiles ||
            !archivedCollections
        ) {
            return;
        }

        if (activeCollectionID === TRASH_SECTION && !selectedSearchOption) {
            return getUniqueFiles([
                ...trashedFiles,
                ...files.filter((file) => tempDeletedFileIds?.has(file.id)),
            ]);
        }

        let filteredFiles: EnteFile[] = [];
        if (selectedSearchOption) {
            filteredFiles = await filterSearchableFiles(
                selectedSearchOption.suggestion,
            );
        } else if (person) {
            const pfSet = new Set(person.fileIDs);
            filteredFiles = files.filter((f) => pfSet.has(f.id));
        } else {
            filteredFiles = getUniqueFiles(
                (isInHiddenSection ? hiddenFiles : files).filter((item) => {
                    if (tempDeletedFileIds?.has(item.id)) {
                        return false;
                    }

                    if (!isInHiddenSection && tempHiddenFileIds?.has(item.id)) {
                        return false;
                    }

                    // archived collections files can only be seen in their respective collection
                    if (archivedCollections.has(item.collectionID)) {
                        if (activeCollectionID === item.collectionID) {
                            return true;
                        } else {
                            return false;
                        }
                    }

                    // HIDDEN ITEMS SECTION - show all individual hidden files
                    if (
                        activeCollectionID === HIDDEN_ITEMS_SECTION &&
                        defaultHiddenCollectionIDs.has(item.collectionID)
                    ) {
                        return true;
                    }

                    // Archived files can only be seen in archive section or their respective collection
                    if (isArchivedFile(item)) {
                        if (
                            activeCollectionID === ARCHIVE_SECTION ||
                            activeCollectionID === item.collectionID
                        ) {
                            return true;
                        } else {
                            return false;
                        }
                    }

                    // ALL SECTION - show all files
                    if (activeCollectionID === ALL_SECTION) {
                        // show all files except the ones in hidden collections
                        if (hiddenFileIds.has(item.id)) {
                            return false;
                        } else {
                            return true;
                        }
                    }

                    // COLLECTION SECTION - show files in the active collection
                    if (activeCollectionID === item.collectionID) {
                        return true;
                    } else {
                        return false;
                    }
                }),
            );
        }
        const sortAsc = activeCollection?.pubMagicMetadata?.data?.asc ?? false;
        if (sortAsc) {
            return sortFiles(filteredFiles, true);
        } else {
            return filteredFiles;
        }
    }, [
        files,
        trashedFiles,
        hiddenFiles,
        tempDeletedFileIds,
        tempHiddenFileIds,
        hiddenFileIds,
        selectedSearchOption,
        activeCollectionID,
        archivedCollections,
        person,
    ]);

    const selectAll = (e: KeyboardEvent) => {
        // ignore ctrl/cmd + a if the user is typing in a text field
        if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement
        ) {
            return;
        }
        // if any of the modals are open, don't select all
        if (
            sidebarView ||
            uploadTypeSelectorView ||
            collectionSelectorView ||
            collectionNamerView ||
            fixCreationTimeView ||
            planModalView ||
            exportModalView ||
            authenticateUserModalView ||
            isPhotoSwipeOpen ||
            !filteredData?.length ||
            !user
        ) {
            return;
        }
        e.preventDefault();
        const selected = {
            ownCount: 0,
            count: 0,
            collectionID: activeCollectionID,
        };

        filteredData.forEach((item) => {
            if (item.ownerID === user.id) {
                selected.ownCount++;
            }
            selected.count++;
            selected[item.id] = true;
        });
        setSelected(selected);
    };

    const clearSelection = () => {
        if (!selected?.count) {
            return;
        }
        setSelected({ ownCount: 0, count: 0, collectionID: 0 });
    };

    const keyboardShortcutHandlerRef = useRef({
        selectAll,
        clearSelection,
    });

    useEffect(() => {
        keyboardShortcutHandlerRef.current = {
            selectAll,
            clearSelection,
        };
    }, [selectAll, clearSelection]);

    useEffect(() => {
        // TODO-Cluster
        if (process.env.NEXT_PUBLIC_ENTE_WIP_CL_AUTO) {
            setTimeout(() => {
                if (!wipHasSwitchedOnceCmpAndSet())
                    router.push("cluster-debug");
            }, 2000);
        }
    }, []);

    const fileToCollectionsMap = useMemoSingleThreaded(() => {
        return constructFileToCollectionMap(files);
    }, [files]);

    const collectionNameMap = useMemo(() => {
        if (!collections || !hiddenCollections) {
            return new Map();
        }
        return constructCollectionNameMap([
            ...collections,
            ...hiddenCollections,
        ]);
    }, [collections, hiddenCollections]);

    const showSessionExpiredMessage = () => {
        setDialogMessage(getSessionExpiredMessage(logout));
    };

    const syncWithRemote = async (force = false, silent = false) => {
        if (!navigator.onLine) return;
        if (syncInProgress.current && !force) {
            resync.current = { force, silent };
            return;
        }
        syncInProgress.current = true;
        try {
            const token = getToken();
            if (!token) {
                return;
            }
            const tokenValid = await isTokenValid(token);
            if (!tokenValid) {
                throw new Error(CustomError.SESSION_EXPIRED);
            }
            !silent && startLoading();
            await preFileInfoSync();
            const collections = await getAllLatestCollections();
            const { normalCollections, hiddenCollections } =
                await splitNormalAndHiddenCollections(collections);
            setCollections(normalCollections);
            setHiddenCollections(hiddenCollections);
            await syncFiles("normal", normalCollections, setFiles);
            await syncFiles("hidden", hiddenCollections, setHiddenFiles);
            await syncTrash(collections, setTrashedFiles);
            await sync();
        } catch (e) {
            switch (e.message) {
                case CustomError.SESSION_EXPIRED:
                    showSessionExpiredMessage();
                    break;
                case CustomError.KEY_MISSING:
                    clearKeys();
                    router.push(PAGES.CREDENTIALS);
                    break;
                default:
                    log.error("syncWithRemote failed", e);
            }
        } finally {
            setTempDeletedFileIds(new Set());
            setTempHiddenFileIds(new Set());
            !silent && finishLoading();
        }
        syncInProgress.current = false;
        if (resync.current) {
            const { force, silent } = resync.current;
            setTimeout(() => syncWithRemote(force, silent), 0);
            resync.current = null;
        }
    };

    const setupSelectAllKeyBoardShortcutHandler = () => {
        const handleKeyUp = (e: KeyboardEvent) => {
            switch (e.key) {
                case "Escape":
                    keyboardShortcutHandlerRef.current.clearSelection();
                    break;
                case "a":
                    if (e.ctrlKey || e.metaKey) {
                        keyboardShortcutHandlerRef.current.selectAll(e);
                    }
                    break;
            }
        };
        document.addEventListener("keydown", handleKeyUp);
        return () => {
            document.removeEventListener("keydown", handleKeyUp);
        };
    };

    const setDerivativeState = async (
        user: User,
        collections: Collection[],
        hiddenCollections: Collection[],
        files: EnteFile[],
        trashedFiles: EnteFile[],
        hiddenFiles: EnteFile[],
    ) => {
        const favItemIds = await getFavItemIds(files);
        setFavItemIds(favItemIds);
        const archivedCollections = getArchivedCollections(collections);
        setArchivedCollections(archivedCollections);
        const defaultHiddenCollectionIDs =
            getDefaultHiddenCollectionIDs(hiddenCollections);
        setDefaultHiddenCollectionIDs(defaultHiddenCollectionIDs);
        const hiddenFileIds = new Set<number>(hiddenFiles.map((f) => f.id));
        setHiddenFileIds(hiddenFileIds);
        const collectionSummaries = getCollectionSummaries(
            user,
            collections,
            files,
        );
        const sectionSummaries = getSectionSummaries(
            files,
            trashedFiles,
            archivedCollections,
        );
        const hiddenCollectionSummaries = getCollectionSummaries(
            user,
            hiddenCollections,
            hiddenFiles,
        );
        const hiddenItemsSummaries = getHiddenItemsSummary(
            hiddenFiles,
            hiddenCollections,
        );
        hiddenCollectionSummaries.set(
            HIDDEN_ITEMS_SECTION,
            hiddenItemsSummaries,
        );
        setCollectionSummaries(
            mergeMaps(collectionSummaries, sectionSummaries),
        );
        setHiddenCollectionSummaries(hiddenCollectionSummaries);
    };

    if (!collectionSummaries || !filteredData) {
        return <div />;
    }

    const setFilesDownloadProgressAttributesCreator: SetFilesDownloadProgressAttributesCreator =
        (folderName, collectionID, isHidden) => {
            const id = filesDownloadProgressAttributesList?.length ?? 0;
            const updater: SetFilesDownloadProgressAttributes = (value) => {
                setFilesDownloadProgressAttributesList((prev) => {
                    const attributes = prev?.find((attr) => attr.id === id);
                    const updatedAttributes =
                        typeof value === "function"
                            ? value(attributes)
                            : { ...attributes, ...value };
                    const updatedAttributesList = attributes
                        ? prev.map((attr) =>
                              attr.id === id ? updatedAttributes : attr,
                          )
                        : [...prev, updatedAttributes];

                    return updatedAttributesList;
                });
            };
            updater({
                id,
                folderName,
                collectionID,
                isHidden,
                canceller: null,
                total: 0,
                success: 0,
                failed: 0,
                downloadDirPath: null,
            });
            return updater;
        };

    const collectionOpsHelper =
        (ops: COLLECTION_OPS_TYPE) => async (collection: Collection) => {
            startLoading();
            try {
                setCollectionSelectorView(false);
                const selectedFiles = getSelectedFiles(selected, filteredData);
                const toProcessFiles =
                    ops === COLLECTION_OPS_TYPE.REMOVE
                        ? selectedFiles
                        : selectedFiles.filter(
                              (file) => file.ownerID === user.id,
                          );
                if (toProcessFiles.length > 0) {
                    await handleCollectionOps(
                        ops,
                        collection,
                        toProcessFiles,
                        selected.collectionID,
                    );
                }
                if (selected?.ownCount === filteredData?.length) {
                    if (
                        ops === COLLECTION_OPS_TYPE.REMOVE ||
                        ops === COLLECTION_OPS_TYPE.RESTORE ||
                        ops === COLLECTION_OPS_TYPE.MOVE
                    ) {
                        // redirect to all section when no items are left in the current collection.
                        setActiveCollectionID(ALL_SECTION);
                    } else if (ops === COLLECTION_OPS_TYPE.UNHIDE) {
                        exitHiddenSection();
                    }
                }
                clearSelection();
                await syncWithRemote(false, true);
            } catch (e) {
                log.error(`collection ops (${ops}) failed`, e);
                setDialogMessage({
                    title: t("ERROR"),

                    close: { variant: "critical" },
                    content: t("UNKNOWN_ERROR"),
                });
            } finally {
                finishLoading();
            }
        };

    const fileOpsHelper = (ops: FILE_OPS_TYPE) => async () => {
        startLoading();
        try {
            // passing files here instead of filteredData for hide ops because we want to move all files copies to hidden collection
            const selectedFiles = getSelectedFiles(
                selected,
                ops === FILE_OPS_TYPE.HIDE ? files : filteredData,
            );
            const toProcessFiles =
                ops === FILE_OPS_TYPE.DOWNLOAD
                    ? selectedFiles
                    : selectedFiles.filter((file) => file.ownerID === user.id);
            if (toProcessFiles.length > 0) {
                await handleFileOps(
                    ops,
                    toProcessFiles,
                    setTempDeletedFileIds,
                    setTempHiddenFileIds,
                    setFixCreationTimeAttributes,
                    setFilesDownloadProgressAttributesCreator,
                );
            }
            if (
                selected?.ownCount === filteredData?.length &&
                ops !== FILE_OPS_TYPE.ARCHIVE &&
                ops !== FILE_OPS_TYPE.DOWNLOAD &&
                ops !== FILE_OPS_TYPE.FIX_TIME
            ) {
                setActiveCollectionID(ALL_SECTION);
            }
            clearSelection();
            await syncWithRemote(false, true);
        } catch (e) {
            log.error(`file ops (${ops}) failed`, e);
            setDialogMessage({
                title: t("ERROR"),

                close: { variant: "critical" },
                content: t("UNKNOWN_ERROR"),
            });
        } finally {
            finishLoading();
        }
    };

    const showCreateCollectionModal = (ops: COLLECTION_OPS_TYPE) => {
        const callback = async (collectionName: string) => {
            try {
                startLoading();
                const collection = await createAlbum(collectionName);
                await collectionOpsHelper(ops)(collection);
            } catch (e) {
                log.error(`create and collection ops (${ops}) failed`, e);
                setDialogMessage({
                    title: t("ERROR"),

                    close: { variant: "critical" },
                    content: t("UNKNOWN_ERROR"),
                });
            } finally {
                finishLoading();
            }
        };
        return () =>
            setCollectionNamerAttributes({
                title: t("CREATE_COLLECTION"),
                buttonText: t("CREATE"),
                autoFilledName: "",
                callback,
            });
    };

    const handleSelectSearchOption = (
        searchOption: SearchOption | undefined,
    ) => {
        if (searchOption?.suggestion.type == "collection") {
            setIsInSearchMode(false);
            setSelectedSearchOption(undefined);
            setActiveCollectionID(searchOption.suggestion.collectionID);
        } else {
            setIsInSearchMode(!!searchOption);
            setSelectedSearchOption(searchOption);
        }
        setIsClipSearchResult(searchOption?.suggestion.type == "clip");
    };

    const openUploader = (intent?: UploadTypeSelectorIntent) => {
        if (!uploadManager.shouldAllowNewUpload()) {
            return;
        }
        setUploadTypeSelectorView(true);
        setUploadTypeSelectorIntent(intent ?? "upload");
    };

    const closeCollectionSelector = () => {
        setCollectionSelectorView(false);
    };

    const openExportModal = () => {
        setExportModalView(true);
    };

    const closeExportModal = () => {
        setExportModalView(false);
    };

    const openHiddenSection: GalleryContextType["openHiddenSection"] = (
        callback,
    ) => {
        authenticateUser(() => {
            setIsInHiddenSection(true);
            setActiveCollectionID(HIDDEN_ITEMS_SECTION);
            callback?.();
        });
    };

    const exitHiddenSection = () => {
        setIsInHiddenSection(false);
        setActiveCollectionID(ALL_SECTION);
    };

    const handleSelectPeople = () => {
        console.log("onSelectPeople");
    };

    if (person) {
        log.debug(() => ["person", person]);
    }

    return (
        <GalleryContext.Provider
            value={{
                ...defaultGalleryContext,
                showPlanSelectorModal,
                setActiveCollectionID,
                syncWithRemote,
                setBlockingLoad,
                setIsInSearchMode,
                photoListHeader,
                openExportModal,
                authenticateUser,
                userIDToEmailMap,
                user,
                emailList,
                openHiddenSection,
                isClipSearchResult,
                selectedFile: selected,
                setSelectedFiles: setSelected,
            }}
        >
            <FullScreenDropZone {...{ getDragAndDropRootProps }}>
                <UploadSelectorInputs
                    {...{
                        getDragAndDropInputProps,
                        getFileSelectorInputProps,
                        getFolderSelectorInputProps,
                        getZipFileSelectorInputProps,
                    }}
                />
                {blockingLoad && (
                    <LoadingOverlay>
                        <EnteSpinner />
                    </LoadingOverlay>
                )}
                {isFirstLoad && (
                    <CenteredFlex>
                        <Typography color="text.muted" variant="small">
                            {t("INITIAL_LOAD_DELAY_WARNING")}
                        </Typography>
                    </CenteredFlex>
                )}
                <PlanSelector
                    modalView={planModalView}
                    closeModal={() => setPlanModalView(false)}
                    setLoading={setBlockingLoad}
                />
                <CollectionNamer
                    show={collectionNamerView}
                    onHide={setCollectionNamerView.bind(null, false)}
                    attributes={collectionNamerAttributes}
                />
                <CollectionSelector
                    open={collectionSelectorView}
                    onClose={closeCollectionSelector}
                    collectionSummaries={collectionSummaries}
                    attributes={collectionSelectorAttributes}
                    collections={collections}
                />
                <FilesDownloadProgress
                    attributesList={filesDownloadProgressAttributesList}
                    setAttributesList={setFilesDownloadProgressAttributesList}
                />
                <FixCreationTime
                    isOpen={fixCreationTimeView}
                    hide={() => setFixCreationTimeView(false)}
                    attributes={fixCreationTimeAttributes}
                />
                <NavbarBase
                    sx={{ background: "transparent", position: "absolute" }}
                >
                    {isInHiddenSection ? (
                        <HiddenSectionNavbarContents
                            onBack={exitHiddenSection}
                        />
                    ) : (
                        <NormalNavbarContents
                            openSidebar={openSidebar}
                            openUploader={openUploader}
                            isInSearchMode={isInSearchMode}
                            setIsInSearchMode={setIsInSearchMode}
                            onSelectSearchOption={handleSelectSearchOption}
                            onSelectPeople={handleSelectPeople}
                            onSelectPerson={setPerson}
                        />
                    )}
                </NavbarBase>

                <Collections
                    activeCollection={activeCollection}
                    isInSearchMode={isInSearchMode}
                    isInHiddenSection={isInHiddenSection}
                    activeCollectionID={activeCollectionID}
                    setActiveCollectionID={setActiveCollectionID}
                    collectionSummaries={collectionSummaries}
                    hiddenCollectionSummaries={hiddenCollectionSummaries}
                    setCollectionNamerAttributes={setCollectionNamerAttributes}
                    setPhotoListHeader={setPhotoListHeader}
                    setFilesDownloadProgressAttributesCreator={
                        setFilesDownloadProgressAttributesCreator
                    }
                    filesDownloadProgressAttributesList={
                        filesDownloadProgressAttributesList
                    }
                />

                <Uploader
                    activeCollection={activeCollection}
                    syncWithRemote={syncWithRemote}
                    showCollectionSelector={setCollectionSelectorView.bind(
                        null,
                        true,
                    )}
                    closeUploadTypeSelector={setUploadTypeSelectorView.bind(
                        null,
                        false,
                    )}
                    setCollectionSelectorAttributes={
                        setCollectionSelectorAttributes
                    }
                    closeCollectionSelector={setCollectionSelectorView.bind(
                        null,
                        false,
                    )}
                    setLoading={setBlockingLoad}
                    setCollectionNamerAttributes={setCollectionNamerAttributes}
                    setShouldDisableDropzone={setShouldDisableDropzone}
                    setFiles={setFiles}
                    setCollections={setCollections}
                    isFirstUpload={
                        !hasNonSystemCollections(collectionSummaries)
                    }
                    {...{
                        dragAndDropFiles,
                        openFileSelector,
                        fileSelectorFiles,
                        openFolderSelector,
                        folderSelectorFiles,
                        openZipFileSelector,
                        fileSelectorZipFiles,
                        uploadTypeSelectorIntent,
                        uploadTypeSelectorView,
                        showSessionExpiredMessage,
                    }}
                />
                <Sidebar
                    collectionSummaries={collectionSummaries}
                    sidebarView={sidebarView}
                    closeSidebar={closeSidebar}
                />
                <WhatsNew
                    open={openWhatsNew}
                    onClose={() => setOpenWhatsNew(false)}
                />
                {!isInSearchMode &&
                !isFirstLoad &&
                !files?.length &&
                !hiddenFiles?.length &&
                activeCollectionID === ALL_SECTION ? (
                    <GalleryEmptyState openUploader={openUploader} />
                ) : (
                    <PhotoFrame
                        page={PAGES.GALLERY}
                        files={filteredData}
                        syncWithRemote={syncWithRemote}
                        favItemIds={favItemIds}
                        setSelected={setSelected}
                        selected={selected}
                        tempDeletedFileIds={tempDeletedFileIds}
                        setTempDeletedFileIds={setTempDeletedFileIds}
                        setIsPhotoSwipeOpen={setIsPhotoSwipeOpen}
                        activeCollectionID={activeCollectionID}
                        enableDownload={true}
                        fileToCollectionsMap={fileToCollectionsMap}
                        collectionNameMap={collectionNameMap}
                        showAppDownloadBanner={
                            files.length < 30 && !isInSearchMode
                        }
                        isInHiddenSection={isInHiddenSection}
                        setFilesDownloadProgressAttributesCreator={
                            setFilesDownloadProgressAttributesCreator
                        }
                        selectable={true}
                    />
                )}
                {selected.count > 0 &&
                    selected.collectionID === activeCollectionID && (
                        <SelectedFileOptions
                            handleCollectionOps={collectionOpsHelper}
                            handleFileOps={fileOpsHelper}
                            showCreateCollectionModal={
                                showCreateCollectionModal
                            }
                            setCollectionSelectorAttributes={
                                setCollectionSelectorAttributes
                            }
                            count={selected.count}
                            ownCount={selected.ownCount}
                            clearSelection={clearSelection}
                            activeCollectionID={activeCollectionID}
                            selectedCollection={getSelectedCollection(
                                selected.collectionID,
                                collections,
                            )}
                            isFavoriteCollection={
                                collectionSummaries.get(activeCollectionID)
                                    ?.type === CollectionSummaryType.favorites
                            }
                            isUncategorizedCollection={
                                collectionSummaries.get(activeCollectionID)
                                    ?.type ===
                                CollectionSummaryType.uncategorized
                            }
                            isIncomingSharedCollection={
                                collectionSummaries.get(activeCollectionID)
                                    ?.type ===
                                    CollectionSummaryType.incomingShareCollaborator ||
                                collectionSummaries.get(activeCollectionID)
                                    ?.type ===
                                    CollectionSummaryType.incomingShareViewer
                            }
                            isInSearchMode={isInSearchMode}
                            isInHiddenSection={isInHiddenSection}
                        />
                    )}
                <ExportModal
                    show={exportModalView}
                    onHide={closeExportModal}
                    collectionNameMap={collectionNameMap}
                />
                <AuthenticateUserModal
                    open={authenticateUserModalView}
                    onClose={closeAuthenticateUserModal}
                    onAuthenticate={onAuthenticateCallback.current}
                />
            </FullScreenDropZone>
        </GalleryContext.Provider>
    );
}

/**
 * Preload all three variants of a responsive image.
 */
const preloadImage = (imgBasePath: string) => {
    const srcset = [];
    for (let i = 1; i <= 3; i++) srcset.push(`${imgBasePath}/${i}x.png ${i}x`);
    new Image().srcset = srcset.join(",");
};

const mergeMaps = <K, V>(map1: Map<K, V>, map2: Map<K, V>) => {
    const mergedMap = new Map<K, V>(map1);
    map2.forEach((value, key) => {
        mergedMap.set(key, value);
    });
    return mergedMap;
};

type NormalNavbarContentsProps = SearchBarProps & {
    openSidebar: () => void;
    openUploader: () => void;
};

const NormalNavbarContents: React.FC<NormalNavbarContentsProps> = ({
    openSidebar,
    openUploader,
    ...props
}) => (
    <>
        {!props.isInSearchMode && <SidebarButton onClick={openSidebar} />}
        <SearchBar {...props} />
        {!props.isInSearchMode && <UploadButton onClick={openUploader} />}
    </>
);

const SidebarButton: React.FC<IconButtonProps> = (props) => (
    <IconButton {...props}>
        <MenuIcon />
    </IconButton>
);

const UploadButton: React.FC<ButtonProps & IconButtonProps> = (props) => {
    const disabled = !uploadManager.shouldAllowNewUpload();
    const isMobileWidth = useIsMobileWidth();

    const icon = <FileUploadOutlinedIcon />;

    return (
        <Box>
            {isMobileWidth ? (
                <IconButton {...props} disabled={disabled}>
                    {icon}
                </IconButton>
            ) : (
                <Button
                    {...props}
                    disabled={disabled}
                    color={"secondary"}
                    startIcon={icon}
                >
                    {t("upload")}
                </Button>
            )}
        </Box>
    );
};

interface HiddenSectionNavbarContentsProps {
    onBack: () => void;
}

const HiddenSectionNavbarContents: React.FC<
    HiddenSectionNavbarContentsProps
> = ({ onBack }) => (
    <HorizontalFlex
        gap={"24px"}
        sx={{
            width: "100%",
            background: (theme) => theme.palette.background.default,
        }}
    >
        <IconButton onClick={onBack}>
            <ArrowBack />
        </IconButton>
        <FlexWrapper>
            <Typography>{t("HIDDEN")}</Typography>
        </FlexWrapper>
    </HorizontalFlex>
);

interface SearchResultsHeaderProps {
    selectedOption: SearchOption;
}

const SearchResultsHeader: React.FC<SearchResultsHeaderProps> = ({
    selectedOption,
}) => (
    <CollectionInfoBarWrapper>
        <Typography color="text.muted" variant="large">
            {t("search_results")}
        </Typography>
        <CollectionInfo
            name={selectedOption.suggestion.label}
            fileCount={selectedOption.fileCount}
        />
    </CollectionInfoBarWrapper>
);
