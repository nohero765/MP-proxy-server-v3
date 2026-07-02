import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const imagesTable = pgTable("loon_images", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  contentType: text("content_type").notNull(),
  servedAt: timestamp("served_at", { withTimezone: true }).notNull(),
  filename: text("filename").notNull(),
  sizeBytes: integer("size_bytes"),
});

export const insertImageSchema = createInsertSchema(imagesTable).omit({ id: true });
export type InsertImage = z.infer<typeof insertImageSchema>;
export type LoonImageRow = typeof imagesTable.$inferSelect;
