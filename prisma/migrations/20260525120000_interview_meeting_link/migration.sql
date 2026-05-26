-- Optional meeting URL on InterviewRound. Nullable — old rounds keep working.
ALTER TABLE "InterviewRound" ADD COLUMN "meetingLink" TEXT;
