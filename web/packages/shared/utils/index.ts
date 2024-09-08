import { ensure } from "@/utils/ensure";
import { wait } from "@/utils/promise";

export function downloadAsFile(filename: string, content: string) {
    const file = new Blob([content], {
        type: "text/plain",
    });
    const fileURL = URL.createObjectURL(file);
    downloadUsingAnchor(fileURL, filename);
}

export function downloadUsingAnchor(link: string, name: string) {
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = link;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(link);
    a.remove();
}

export async function retryAsyncFunction<T>(
    request: (abort?: () => void) => Promise<T>,
    waitTimeBeforeNextTry?: number[],
    // Need to use @ts-ignore since this same file is currently included with
    // varying tsconfigs, and the error is only surfaced in the stricter ones of
    // them.
    //
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore TSC fails to detect that the exit of the loop is unreachable
): Promise<T> {
    if (!waitTimeBeforeNextTry) waitTimeBeforeNextTry = [2000, 5000, 10000];

    for (
        let attemptNumber = 0;
        attemptNumber <= waitTimeBeforeNextTry.length;
        attemptNumber++
    ) {
        try {
            const resp = await request();
            return resp;
        } catch (e) {
            if (attemptNumber === waitTimeBeforeNextTry.length) {
                throw e;
            }
            await wait(ensure(waitTimeBeforeNextTry[attemptNumber]));
        }
    }
}
