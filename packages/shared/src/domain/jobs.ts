export type JobStatus = "pending" | "processing" | "completed" | "failed";

export type JobType = "batch_check" | "export";

export interface JobPayload {
    batch_check: {
        batchId: string;
        userId: string;
    };
    export: {
        exportId: string;
        userId: string;
    };
}
