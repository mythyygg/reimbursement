export type ReceiptRecord = {
  receiptId: string;
  fileUrl?: string | null;
  fileExt?: string | null;
  merchantKeyword?: string | null;
  matchedExpenseId?: string | null;
  duplicateFlag?: boolean | null;
  receiptDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  receiptAmount?: string | null;
};

export type CandidateRecord = {
  expenseId: string;
  note?: string | null;
  amount?: number | null;
  date?: string | null;
  confidence?: string | null;
  status?: string | null;
};
