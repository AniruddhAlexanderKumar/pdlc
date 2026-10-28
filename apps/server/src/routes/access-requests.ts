import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  ACCESS_REQUEST_INDUSTRIES,
  ACCESS_REQUEST_ROLES,
  ACCESS_REQUEST_STAGES,
  ACCESS_REQUEST_TEAM_SIZES,
} from "@sv/shared";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { parse, route, shortText } from "../lib/http.js";

export const accessRequestsRouter = Router();

const submissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.NODE_ENV === "test" ? 1000 : 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid work email address"));

const requestSchema = z.object({
  name: shortText(100).min(1, "Enter your name"),
  email: emailSchema,
  organization: shortText(120).min(1, "Enter your company or team"),
  role: z.enum(ACCESS_REQUEST_ROLES),
  industry: z.enum(ACCESS_REQUEST_INDUSTRIES),
  teamSize: z.enum(ACCESS_REQUEST_TEAM_SIZES),
  productStage: z.enum(ACCESS_REQUEST_STAGES),
  currentTools: shortText(500).default(""),
  goals: shortText(2000).min(
    10,
    "Tell us a little more about what you would like to improve",
  ),
});

accessRequestsRouter.post(
  "/",
  submissionLimiter,
  route(async (req, res) => {
    const body = parse(requestSchema, req.body);
    const request = await db
      .insertInto("access_requests")
      .values({
        name: body.name,
        email: body.email,
        organization: body.organization,
        role: body.role,
        industry: body.industry,
        team_size: body.teamSize,
        product_stage: body.productStage,
        current_tools: body.currentTools,
        goals: body.goals,
      })
      .returning(["id", "status"])
      .executeTakeFirstOrThrow();

    res.status(201).json({ id: request.id, status: request.status });
  }),
);
