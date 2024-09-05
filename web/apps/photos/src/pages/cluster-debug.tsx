import { SelectionBar } from "@/base/components/Navbar";
import { pt } from "@/base/i18n";
import {
    faceCrop,
    wipClusterDebugPageContents,
    type ClusterDebugPageContents,
} from "@/new/photos/services/ml";
import {
    type ClusterFace,
    type ClusteringOpts,
    type ClusteringProgress,
    type OnClusteringProgress,
} from "@/new/photos/services/ml/cluster";
import { faceDirection } from "@/new/photos/services/ml/face";
import type { EnteFile } from "@/new/photos/types/file";
import {
    FlexWrapper,
    FluidContainer,
    VerticallyCentered,
} from "@ente/shared/components/Container";
import BackButton from "@mui/icons-material/ArrowBackOutlined";
import {
    Box,
    Button,
    Checkbox,
    FormControlLabel,
    IconButton,
    LinearProgress,
    Stack,
    styled,
    TextField,
    Typography,
} from "@mui/material";
import { useFormik, type FormikProps } from "formik";
import { useRouter } from "next/router";
import { AppContext } from "pages/_app";
import React, {
    memo,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import {
    areEqual,
    VariableSizeList,
    type ListChildComponentProps,
} from "react-window";

// TODO-Cluster Temporary component for debugging
export default function ClusterDebug() {
    const { startLoading, finishLoading, showNavBar } = useContext(AppContext);

    // The clustering result.
    const [clusterRes, setClusterRes] = useState<
        ClusterDebugPageContents | undefined
    >();

    // Keep the loading state callback as a ref instead of state to prevent
    // rerendering when the progress gets updated during clustering.
    const onProgressRef = useRef<OnClusteringProgress | undefined>();

    // Keep the form state at the top level otherwise it gets reset as we
    // scroll.
    const formik = useFormik<ClusteringOpts>({
        initialValues: {
            minBlur: 10,
            minScore: 0.8,
            minClusterSize: 2,
            joinThreshold: 0.76,
            earlyExitThreshold: 0.9,
            batchSize: 10000,
            offsetIncrement: 7500,
            badFaceHeuristics: true,
        },
        onSubmit: (values) =>
            cluster(
                {
                    minBlur: toFloat(values.minBlur),
                    minScore: toFloat(values.minScore),
                    minClusterSize: toFloat(values.minClusterSize),
                    joinThreshold: toFloat(values.joinThreshold),
                    earlyExitThreshold: toFloat(values.earlyExitThreshold),
                    batchSize: toFloat(values.batchSize),
                    offsetIncrement: toFloat(values.offsetIncrement),
                    badFaceHeuristics: values.badFaceHeuristics,
                },
                (progress: ClusteringProgress) =>
                    onProgressRef.current?.(progress),
            ),
    });

    const cluster = useCallback(
        async (opts: ClusteringOpts, onProgress: OnClusteringProgress) => {
            setClusterRes(undefined);
            startLoading();
            setClusterRes(await wipClusterDebugPageContents(opts, onProgress));
            finishLoading();
        },
        [startLoading, finishLoading],
    );

    useEffect(() => showNavBar(true), []);

    return (
        <>
            <Container>
                <AutoSizer>
                    {({ height, width }) => (
                        <ClusterList {...{ width, height, clusterRes }}>
                            <OptionsForm {...{ formik, onProgressRef }} />
                        </ClusterList>
                    )}
                </AutoSizer>
            </Container>
            <Options />
        </>
    );
}

// Formik converts nums to a string on edit.
const toFloat = (n: number | string) =>
    typeof n == "string" ? parseFloat(n) : n;

const Options: React.FC = () => {
    const router = useRouter();

    const close = () => router.push("/gallery");

    return (
        <SelectionBar>
            <FluidContainer>
                <IconButton onClick={close}>
                    <BackButton />
                </IconButton>
                <Box sx={{ marginInline: "auto" }}>{pt("Face Clusters")}</Box>
            </FluidContainer>
        </SelectionBar>
    );
};

const Container = styled("div")`
    display: block;
    flex: 1;
    width: 100%;
    flex-wrap: wrap;
    overflow: hidden;
    .pswp-thumbnail {
        display: inline-block;
    }
`;

type OptionsFormProps = LoaderProps & {
    formik: FormikProps<ClusteringOpts>;
};

const OptionsForm: React.FC<OptionsFormProps> = ({ formik, onProgressRef }) => {
    return (
        <Stack>
            <Typography paddingInline={1}>Parameters</Typography>
            <MemoizedForm {...formik} />
            {formik.isSubmitting && <Loader {...{ onProgressRef }} />}
        </Stack>
    );
};

const MemoizedForm = memo(
    ({
        values,
        handleSubmit,
        handleChange,
        isSubmitting,
    }: FormikProps<ClusteringOpts>) => (
        <form onSubmit={handleSubmit}>
            <Stack>
                <Stack
                    direction="row"
                    gap={1}
                    sx={{ ".MuiFormControl-root": { flex: "1" } }}
                >
                    <TextField
                        name="minBlur"
                        label="minBlur"
                        value={values.minBlur}
                        size="small"
                        onChange={handleChange}
                    />
                    <TextField
                        name="minScore"
                        label="minScore"
                        value={values.minScore}
                        size="small"
                        onChange={handleChange}
                    />
                    <TextField
                        name="minClusterSize"
                        label="minClusterSize"
                        value={values.minClusterSize}
                        size="small"
                        onChange={handleChange}
                    />
                    <TextField
                        name="joinThreshold"
                        label="joinThreshold"
                        value={values.joinThreshold}
                        size="small"
                        onChange={handleChange}
                    />
                    <TextField
                        name="earlyExitThreshold"
                        label="earlyExitThreshold"
                        value={values.earlyExitThreshold}
                        size="small"
                        onChange={handleChange}
                    />
                    <TextField
                        name="batchSize"
                        label="batchSize"
                        value={values.batchSize}
                        size="small"
                        onChange={handleChange}
                    />
                    <TextField
                        name="offsetIncrement"
                        label="offsetIncrement"
                        value={values.offsetIncrement}
                        size="small"
                        onChange={handleChange}
                    />
                </Stack>
                <Stack direction="row" justifyContent={"space-between"} p={1}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                name={"badFaceHeuristics"}
                                checked={values.badFaceHeuristics}
                                size="small"
                                onChange={handleChange}
                            />
                        }
                        label={
                            <Typography color="text.secondary">
                                Bad face heuristics
                            </Typography>
                        }
                    />
                    <Button
                        color="secondary"
                        type="submit"
                        disabled={isSubmitting}
                    >
                        Cluster
                    </Button>
                </Stack>
            </Stack>
        </form>
    ),
);

interface LoaderProps {
    onProgressRef: React.MutableRefObject<OnClusteringProgress | undefined>;
}

const Loader: React.FC<LoaderProps> = ({ onProgressRef }) => {
    const [progress, setProgress] = useState<ClusteringProgress>({
        completed: 0,
        total: 0,
    });

    onProgressRef.current = setProgress;

    const { completed, total } = progress;

    return (
        <VerticallyCentered mt={4} gap={2}>
            <Stack
                direction="row"
                gap={1}
                alignItems={"center"}
                paddingInline={"1rem"}
                sx={{
                    width: "100%",
                    "& div": {
                        flex: 1,
                    },
                }}
            >
                <Box sx={{ mr: 1 }}>
                    <LinearProgress
                        variant="determinate"
                        value={
                            total > 0
                                ? Math.round((completed / total) * 100)
                                : 0
                        }
                    />
                </Box>
                <Typography
                    variant="small"
                    sx={{
                        minWidth: "10rem",
                        textAlign: "right",
                    }}
                >{`${completed} / ${total}`}</Typography>
            </Stack>
        </VerticallyCentered>
    );
};

type ClusterListProps = ClusterResHeaderProps & {
    height: number;
    width: number;
};

const ClusterList: React.FC<React.PropsWithChildren<ClusterListProps>> = ({
    width,
    height,
    clusterRes,
    children,
}) => {
    const [items, setItems] = useState<Item[]>([]);
    const listRef = useRef(null);

    const columns = useMemo(
        () => Math.max(Math.floor(getFractionFittableColumns(width)), 4),
        [width],
    );

    const shrinkRatio = getShrinkRatio(width, columns);
    const listItemHeight = 120 * shrinkRatio + 24 + 4;

    useEffect(() => {
        setItems(clusterRes ? itemsFromClusterRes(clusterRes, columns) : []);
    }, [columns, clusterRes]);

    useEffect(() => {
        listRef.current?.resetAfterIndex(0);
    }, [items]);

    const itemSize = (index: number) =>
        index === 0
            ? 140
            : index === 1
              ? 110
              : Array.isArray(items[index - 2])
                ? listItemHeight
                : 36;

    return (
        <VariableSizeList
            height={height}
            width={width}
            ref={listRef}
            itemData={{ items, clusterRes, columns, shrinkRatio, children }}
            itemCount={2 + items.length}
            itemSize={itemSize}
            overscanCount={3}
        >
            {ClusterListItemRenderer}
        </VariableSizeList>
    );
};

type Item = string | FaceWithFile[];

const itemsFromClusterRes = (
    clusterRes: ClusterDebugPageContents,
    columns: number,
) => {
    const { clusterPreviewsWithFile, unclusteredFacesWithFile } = clusterRes;

    const result: Item[] = [];
    for (let index = 0; index < clusterPreviewsWithFile.length; index++) {
        const { clusterSize, faces } = clusterPreviewsWithFile[index];
        result.push(`cluster size ${clusterSize.toFixed(2)}`);
        let lastIndex = 0;
        while (lastIndex < faces.length) {
            result.push(faces.slice(lastIndex, lastIndex + columns));
            lastIndex += columns;
        }
    }

    if (unclusteredFacesWithFile.length) {
        result.push(`•• unclustered faces ${unclusteredFacesWithFile.length}`);
        let lastIndex = 0;
        while (lastIndex < unclusteredFacesWithFile.length) {
            result.push(
                unclusteredFacesWithFile.slice(lastIndex, lastIndex + columns),
            );
            lastIndex += columns;
        }
    }

    return result;
};

const getFractionFittableColumns = (width: number) =>
    (width - 2 * getGapFromScreenEdge(width) + 4) / (120 + 4);

const getGapFromScreenEdge = (width: number) => (width > 4 * 120 ? 24 : 4);

const getShrinkRatio = (width: number, columns: number) =>
    (width - 2 * getGapFromScreenEdge(width) - (columns - 1) * 4) /
    (columns * 120);

// It in necessary to define the item renderer otherwise it gets recreated every
// time the parent rerenders, causing the form to lose its submitting state.
const ClusterListItemRenderer = React.memo<ListChildComponentProps>(
    ({ index, style, data }) => {
        const { clusterRes, columns, shrinkRatio, items, children } = data;

        if (index == 0) return <div style={style}>{children}</div>;

        if (index == 1)
            return (
                <div style={style}>
                    <ClusterResHeader clusterRes={clusterRes} />
                </div>
            );

        const item = items[index - 2];
        return (
            <ListItem style={style}>
                <ListContainer columns={columns} shrinkRatio={shrinkRatio}>
                    {!Array.isArray(item) ? (
                        <LabelContainer span={columns}>{item}</LabelContainer>
                    ) : (
                        item.map((f, i) => (
                            <FaceItem key={i.toString()} faceWithFile={f} />
                        ))
                    )}
                </ListContainer>
            </ListItem>
        );
    },
    areEqual,
);

interface ClusterResHeaderProps {
    clusterRes: ClusterDebugPageContents | undefined;
}

const ClusterResHeader: React.FC<ClusterResHeaderProps> = ({ clusterRes }) => {
    if (!clusterRes) return null;

    const {
        totalFaceCount,
        filteredFaceCount,
        clusteredFaceCount,
        unclusteredFaceCount,
        timeTakenMs,
        clusters,
    } = clusterRes;

    return (
        <Stack m={1}>
            <Typography mb={1} variant="small">
                {`${clusters.length} clusters in ${(timeTakenMs / 1000).toFixed(0)} seconds • ${totalFaceCount} faces ${filteredFaceCount} filtered ${clusteredFaceCount} clustered ${unclusteredFaceCount} unclustered`}
            </Typography>
            <Typography variant="small" color="text.muted">
                Showing only top 30 clusters, bottom 30 clusters, and
                unclustered faces.
            </Typography>
            <Typography variant="small" color="text.muted">
                For each cluster showing only up to 50 faces, sorted by cosine
                similarity to its highest scoring face.
            </Typography>
            <Typography variant="small" color="text.muted">
                Below each face is its blur, score, cosineSimilarity, direction.
                Bad faces are outlined.
            </Typography>
        </Stack>
    );
};

const ListItem = styled("div")`
    display: flex;
    justify-content: center;
`;

const ListContainer = styled(Box, {
    shouldForwardProp: (propName) => propName != "shrinkRatio",
})<{
    columns: number;
    shrinkRatio: number;
}>`
    display: grid;
    grid-template-columns: ${({ columns, shrinkRatio }) =>
        `repeat(${columns},${120 * shrinkRatio}px)`};
    grid-column-gap: 4px;
    width: 100%;
    padding: 4px;
`;

const ListItemContainer = styled(FlexWrapper)<{ span: number }>`
    grid-column: span ${(props) => props.span};
`;

const LabelContainer = styled(ListItemContainer)`
    color: ${({ theme }) => theme.colors.text.muted};
    height: 32px;
`;

interface FaceItemProps {
    faceWithFile: FaceWithFile;
}

interface FaceWithFile {
    face: ClusterFace;
    enteFile: EnteFile;
    cosineSimilarity?: number;
    wasMerged?: boolean;
}

const FaceItem: React.FC<FaceItemProps> = ({ faceWithFile }) => {
    const { face, enteFile, cosineSimilarity } = faceWithFile;
    const { faceID, isBadFace } = face;

    const [objectURL, setObjectURL] = useState<string | undefined>();

    useEffect(() => {
        let didCancel = false;
        let thisObjectURL: string | undefined;

        void faceCrop(faceID, enteFile).then((blob) => {
            if (blob && !didCancel)
                setObjectURL((thisObjectURL = URL.createObjectURL(blob)));
        });

        return () => {
            didCancel = true;
            if (thisObjectURL) URL.revokeObjectURL(thisObjectURL);
        };
    }, [faceID, enteFile]);

    const fd = faceDirection(face.detection);
    const d = fd == "straight" ? "•" : fd == "left" ? "←" : "→";
    return (
        <FaceChip
            style={{
                outline: isBadFace ? `1px solid rosybrown` : undefined,
                outlineOffset: "2px",
            }}
        >
            {objectURL && (
                <img
                    style={{
                        objectFit: "cover",
                        width: "100%",
                        height: "100%",
                    }}
                    src={objectURL}
                />
            )}
            <Stack direction="row" justifyContent="space-between">
                <Typography variant="small" color="text.muted">
                    {`b${face.blur.toFixed(0)} `}
                </Typography>
                <Typography variant="small" color="text.muted">
                    {`s${face.score.toFixed(1)}`}
                </Typography>
                {cosineSimilarity && (
                    <Typography variant="small" color="text.muted">
                        {`c${cosineSimilarity.toFixed(1)}`}
                    </Typography>
                )}
                <Typography variant="small" color="text.muted">
                    {`d${d}`}
                </Typography>
            </Stack>
        </FaceChip>
    );
};

const FaceChip = styled(Box)`
    width: 120px;
    height: 120px;
`;
