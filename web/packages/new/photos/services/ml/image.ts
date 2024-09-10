// See: [Note: Allowing non-null assertions selectively]
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { ensure } from "@/utils/ensure";
import { Matrix, inverse } from "ml-matrix";
import { clamp } from "./math";

/**
 * Returns the pixel value (RGB) at the given coordinates ({@link fx},
 * {@link fy}) using bilinear interpolation (optionally anti-aliased).
 */
export function pixelRGBBilinear(
    fx: number,
    fy: number,
    imageData: Uint8ClampedArray,
    imageWidth: number,
    imageHeight: number,
    antialias: boolean,
) {
    // Clamp to image boundaries.
    fx = clamp(fx, 0, imageWidth - 1);
    fy = clamp(fy, 0, imageHeight - 1);

    // Get the surrounding coordinates and their weights.
    const x0 = Math.floor(fx);
    const x1 = Math.ceil(fx);
    const y0 = Math.floor(fy);
    const y1 = Math.ceil(fy);
    const dx = fx - x0;
    const dy = fy - y0;
    const dx1 = 1.0 - dx;
    const dy1 = 1.0 - dy;

    // Get the original pixels.
    const getPixelRGBA = antialias ? pixelRGBABlurred : pixelRGBA;
    const pixel1 = getPixelRGBA(imageData, imageWidth, imageHeight, x0, y0);
    const pixel2 = getPixelRGBA(imageData, imageWidth, imageHeight, x1, y0);
    const pixel3 = getPixelRGBA(imageData, imageWidth, imageHeight, x0, y1);
    const pixel4 = getPixelRGBA(imageData, imageWidth, imageHeight, x1, y1);

    const bilinear = (val1: number, val2: number, val3: number, val4: number) =>
        Math.round(
            val1 * dx1 * dy1 +
                val2 * dx * dy1 +
                val3 * dx1 * dy +
                val4 * dx * dy,
        );

    // Return interpolated pixel colors.
    return {
        r: bilinear(pixel1.r, pixel2.r, pixel3.r, pixel4.r),
        g: bilinear(pixel1.g, pixel2.g, pixel3.g, pixel4.g),
        b: bilinear(pixel1.b, pixel2.b, pixel3.b, pixel4.b),
    };
}

const pixelRGBA = (
    imageData: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    y: number,
) => {
    if (x < 0 || x >= width || y < 0 || y >= height) {
        return { r: 114, g: 114, b: 114, a: 0 };
    }
    const index = (y * width + x) * 4;
    return {
        r: ensure(imageData[index]),
        g: ensure(imageData[index + 1]),
        b: ensure(imageData[index + 2]),
        a: ensure(imageData[index + 3]),
    };
};

const pixelRGBABlurred = (
    imageData: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    y: number,
) => {
    let r = 0,
        g = 0,
        b = 0;
    for (let ky = 0; ky < gaussianKernelSize; ky++) {
        for (let kx = 0; kx < gaussianKernelSize; kx++) {
            const px = x - gaussianKernelRadius + kx;
            const py = y - gaussianKernelRadius + ky;

            const pixelRgbTuple = pixelRGBA(imageData, width, height, px, py);
            const weight = gaussianKernel[ky]![kx]!;

            r += pixelRgbTuple.r * weight;
            g += pixelRgbTuple.g * weight;
            b += pixelRgbTuple.b * weight;
        }
    }
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: 255 };
};

/**
 * Returns the pixel value (RGB) at the given coordinates ({@link fx},
 * {@link fy}) using bicubic interpolation.
 */
export const pixelRGBBicubic = (
    fx: number,
    fy: number,
    imageData: Uint8ClampedArray,
    imageWidth: number,
    imageHeight: number,
) => {
    // Clamp to image boundaries.
    fx = clamp(fx, 0, imageWidth - 1);
    fy = clamp(fy, 0, imageHeight - 1);

    const x = Math.trunc(fx) - (fx >= 0.0 ? 0 : 1);
    const px = x - 1;
    const nx = x + 1;
    const ax = x + 2;
    const y = Math.trunc(fy) - (fy >= 0.0 ? 0 : 1);
    const py = y - 1;
    const ny = y + 1;
    const ay = y + 2;
    const dx = fx - x;
    const dy = fy - y;

    const cubic = (
        dx: number,
        ipp: number,
        icp: number,
        inp: number,
        iap: number,
    ) =>
        icp +
        0.5 *
            (dx * (-ipp + inp) +
                dx * dx * (2 * ipp - 5 * icp + 4 * inp - iap) +
                dx * dx * dx * (-ipp + 3 * icp - 3 * inp + iap));

    const icc = pixelRGBA(imageData, imageWidth, imageHeight, x, y);

    const ipp =
        px < 0 || py < 0
            ? icc
            : pixelRGBA(imageData, imageWidth, imageHeight, px, py);
    const icp =
        px < 0 ? icc : pixelRGBA(imageData, imageWidth, imageHeight, x, py);
    const inp =
        py < 0 || nx >= imageWidth
            ? icc
            : pixelRGBA(imageData, imageWidth, imageHeight, nx, py);
    const iap =
        ax >= imageWidth || py < 0
            ? icc
            : pixelRGBA(imageData, imageWidth, imageHeight, ax, py);

    const ip0 = cubic(dx, ipp.r, icp.r, inp.r, iap.r);
    const ip1 = cubic(dx, ipp.g, icp.g, inp.g, iap.g);
    const ip2 = cubic(dx, ipp.b, icp.b, inp.b, iap.b);
    // const ip3 = cubic(dx, ipp.a, icp.a, inp.a, iap.a);

    const ipc =
        px < 0 ? icc : pixelRGBA(imageData, imageWidth, imageHeight, px, y);
    const inc =
        nx >= imageWidth
            ? icc
            : pixelRGBA(imageData, imageWidth, imageHeight, nx, y);
    const iac =
        ax >= imageWidth
            ? icc
            : pixelRGBA(imageData, imageWidth, imageHeight, ax, y);

    const ic0 = cubic(dx, ipc.r, icc.r, inc.r, iac.r);
    const ic1 = cubic(dx, ipc.g, icc.g, inc.g, iac.g);
    const ic2 = cubic(dx, ipc.b, icc.b, inc.b, iac.b);
    // const ic3 = cubic(dx, ipc.a, icc.a, inc.a, iac.a);

    const ipn =
        px < 0 || ny >= imageHeight
            ? icc
            : pixelRGBA(imageData, imageWidth, imageHeight, px, ny);
    const icn =
        ny >= imageHeight
            ? icc
            : pixelRGBA(imageData, imageWidth, imageHeight, x, ny);
    const inn =
        nx >= imageWidth || ny >= imageHeight
            ? icc
            : pixelRGBA(imageData, imageWidth, imageHeight, nx, ny);
    const ian =
        ax >= imageWidth || ny >= imageHeight
            ? icc
            : pixelRGBA(imageData, imageWidth, imageHeight, ax, ny);

    const in0 = cubic(dx, ipn.r, icn.r, inn.r, ian.r);
    const in1 = cubic(dx, ipn.g, icn.g, inn.g, ian.g);
    const in2 = cubic(dx, ipn.b, icn.b, inn.b, ian.b);
    // const in3 = cubic(dx, ipn.a, icn.a, inn.a, ian.a);

    const ipa =
        px < 0 || ay >= imageHeight
            ? icc
            : pixelRGBA(imageData, imageWidth, imageHeight, px, ay);
    const ica =
        ay >= imageHeight
            ? icc
            : pixelRGBA(imageData, imageWidth, imageHeight, x, ay);
    const ina =
        nx >= imageWidth || ay >= imageHeight
            ? icc
            : pixelRGBA(imageData, imageWidth, imageHeight, nx, ay);
    const iaa =
        ax >= imageWidth || ay >= imageHeight
            ? icc
            : pixelRGBA(imageData, imageWidth, imageHeight, ax, ay);

    const ia0 = cubic(dx, ipa.r, ica.r, ina.r, iaa.r);
    const ia1 = cubic(dx, ipa.g, ica.g, ina.g, iaa.g);
    const ia2 = cubic(dx, ipa.b, ica.b, ina.b, iaa.b);
    // const ia3 = cubic(dx, ipa.a, ica.a, ina.a, iaa.a);

    const c0 = Math.trunc(clamp(cubic(dy, ip0, ic0, in0, ia0), 0, 255));
    const c1 = Math.trunc(clamp(cubic(dy, ip1, ic1, in1, ia1), 0, 255));
    const c2 = Math.trunc(clamp(cubic(dy, ip2, ic2, in2, ia2), 0, 255));
    // const c3 = cubic(dy, ip3, ic3, in3, ia3);

    return { r: c0, g: c1, b: c2 };
};

/**
 * Transform {@link inputData} starting at {@link inputStartIndex}.
 *
 * @param imageData The {@link ImageData} from which these alignments originate.
 */
export const warpAffineFloat32List = (
    imageData: ImageData,
    faceAlignmentAffineMatrix: number[][],
    faceSize: number,
    inputData: Float32Array,
    inputStartIndex: number,
): void => {
    const { width, height, data: pixelData } = imageData;

    const transformationMatrix = faceAlignmentAffineMatrix.map((row) =>
        row.map((val) => (val != 1.0 ? val * faceSize : 1.0)),
    ); // 3x3

    const A: Matrix = new Matrix([
        [transformationMatrix[0]![0]!, transformationMatrix[0]![1]!],
        [transformationMatrix[1]![0]!, transformationMatrix[1]![1]!],
    ]);
    const Ainverse = inverse(A);

    const b00 = transformationMatrix[0]![2]!;
    const b10 = transformationMatrix[1]![2]!;
    const a00Prime = Ainverse.get(0, 0);
    const a01Prime = Ainverse.get(0, 1);
    const a10Prime = Ainverse.get(1, 0);
    const a11Prime = Ainverse.get(1, 1);

    for (let yTrans = 0; yTrans < faceSize; ++yTrans) {
        for (let xTrans = 0; xTrans < faceSize; ++xTrans) {
            // Perform inverse affine transformation.
            const xOrigin =
                a00Prime * (xTrans - b00) + a01Prime * (yTrans - b10);
            const yOrigin =
                a10Prime * (xTrans - b00) + a11Prime * (yTrans - b10);

            // Get the pixel RGB using bicubic interpolation.
            const { r, g, b } = pixelRGBBicubic(
                xOrigin,
                yOrigin,
                pixelData,
                width,
                height,
            );

            // Set the pixel in the input data.
            const index = (yTrans * faceSize + xTrans) * 3;
            inputData[inputStartIndex + index] = rgbToBipolarFloat(r);
            inputData[inputStartIndex + index + 1] = rgbToBipolarFloat(g);
            inputData[inputStartIndex + index + 2] = rgbToBipolarFloat(b);
        }
    }
};

/** Convert a RGB component 0-255 to a floating point value between -1 and 1. */
const rgbToBipolarFloat = (pixelValue: number) => pixelValue / 127.5 - 1.0;

/** Convert a floating point value between -1 and 1 to a RGB component 0-255. */
const bipolarFloatToRGB = (pixelValue: number) =>
    clamp(Math.round((pixelValue + 1.0) * 127.5), 0, 255);

export const grayscaleIntMatrixFromNormalized2List = (
    imageList: Float32Array,
    faceNumber: number,
    width: number,
    height: number,
): number[][] => {
    const startIndex = faceNumber * width * height * 3;
    return Array.from({ length: height }, (_, y) =>
        Array.from({ length: width }, (_, x) => {
            // 0.299 ∙ Red + 0.587 ∙ Green + 0.114 ∙ Blue
            const pixelIndex = startIndex + 3 * (y * width + x);
            return clamp(
                Math.round(
                    0.299 * bipolarFloatToRGB(imageList[pixelIndex]!) +
                        0.587 * bipolarFloatToRGB(imageList[pixelIndex + 1]!) +
                        0.114 * bipolarFloatToRGB(imageList[pixelIndex + 2]!),
                ),
                0,
                255,
            );
        }),
    );
};

const gaussianKernelSize = 5;
const gaussianKernelRadius = Math.floor(gaussianKernelSize / 2);
const gaussianSigma = 10.0;

const create2DGaussianKernel = (size: number, sigma: number): number[][] => {
    const kernel = Array(size)
        .fill(0)
        .map(() => Array(size).fill(0) as number[]);

    let sum = 0.0;
    const center = Math.floor(size / 2);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dx = x - center;
            const dy = y - center;
            const g =
                (1 / (2 * Math.PI * sigma * sigma)) *
                Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
            kernel[y]![x] = g;
            sum += g;
        }
    }

    // Normalize the kernel.
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            kernel[y]![x]! /= sum;
        }
    }

    return kernel;
};

const gaussianKernel: number[][] = create2DGaussianKernel(
    gaussianKernelSize,
    gaussianSigma,
);
