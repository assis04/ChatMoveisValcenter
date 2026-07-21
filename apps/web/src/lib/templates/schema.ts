import { z } from "zod";

const participantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone_number: z.string().trim().min(8).max(20),
});

export const templateBody = z.object({
  name: z.string().trim().min(1).max(80),
  group_name_base: z.string().trim().max(100).default(""),
  description: z.string().trim().max(512).default(""),
  participants: z.array(participantSchema).max(256).default([]),
  announce: z.boolean().default(false),
  restrict: z.boolean().default(false),
});
