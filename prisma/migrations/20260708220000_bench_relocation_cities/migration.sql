-- A consultant not open to relocating generally may still consider specific
-- cities. Free-text (e.g. "Dallas, Austin"); shown on the form when "Open to
-- relocation" is unchecked.
ALTER TABLE "BenchConsultant" ADD COLUMN "relocationCities" TEXT;
