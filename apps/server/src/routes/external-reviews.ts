import { Router } from "express";
import { randomInt, createHmac, timingSafeEqual } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { sql } from "kysely";
import nodemailer from "nodemailer";
import { z } from "zod";
import { auth, requireRole } from "../auth/session.js";
import { hashToken, newToken } from "../auth/crypto.js";
import { config } from "../config.js";
import { db } from "../db/index.js";
import {
  badRequest,
  forbidden,
  notFound,
  parse,
  route,
  shortText,
  uuid,
} from "../lib/http.js";
import { param } from "./util.js";

export const reviewManagementRouter = Router();
export const reviewerRouter = Router();
reviewManagementRouter.use(requireRole("owner", "admin"));
const emailConfig = () => {
  const host = process.env.REVIEW_SMTP_HOST,
    from = process.env.REVIEW_SMTP_FROM,
    secret = process.env.REVIEW_OTP_SECRET;
  if (!host || !from || !secret || secret.length < 32) return null;
  const port = Number(process.env.REVIEW_SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return {
    host,
    from,
    secret,
    port,
    secure: process.env.REVIEW_SMTP_SECURE === "true",
    user: process.env.REVIEW_SMTP_USER,
    pass: process.env.REVIEW_SMTP_PASSWORD,
  };
};
const otpHash = (id: string, code: string, secret: string) =>
  createHmac("sha256", secret).update(`${id}:${code}`).digest("hex");
const sameHash = (a: string, b: string) => {
  const x = Buffer.from(a, "hex"),
    y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
};
const event = (reviewId: string, eventType: string) =>
  db
    .insertInto("external_review_events")
    .values({ review_id: reviewId, event_type: eventType })
    .execute();
const input = z
  .object({
    projectId: uuid,
    title: shortText(120).min(1),
    instructions: shortText(2000).default(""),
    issueIds: z
      .array(uuid)
      .min(1)
      .max(100)
      .refine((v) => new Set(v).size === v.length),
    expiresAt: z.string().datetime().nullable(),
    reviewerEmail: z.email().max(254).nullable(),
    showLinks: z.boolean().default(false),
  })
  .strict();
function validExpiry(value: string | null) {
  if (value === null) return null;
  const d = new Date(value);
  if (d.getTime() <= Date.now() || d.getTime() > Date.now() + 90 * 86400000)
    throw badRequest("Expiry must be in the future and within 90 days");
  return d;
}
async function checkSelection(
  workspaceId: string,
  projectId: string,
  issueIds: string[],
) {
  const p = await db
    .selectFrom("projects")
    .select("id")
    .where("id", "=", projectId)
    .where("workspace_id", "=", workspaceId)
    .executeTakeFirst();
  if (!p) throw notFound("Project");
  const rows = await db
    .selectFrom("issues")
    .select("id")
    .where("project_id", "=", projectId)
    .where("id", "in", issueIds)
    .execute();
  if (rows.length !== issueIds.length)
    throw badRequest("All selected issues must belong to this project");
}
reviewManagementRouter.get(
  "/settings",
  route(async (req, res) => {
    const w = await db
      .selectFrom("workspaces")
      .select("allow_unrestricted_reviews")
      .where("id", "=", auth(req).workspaceId)
      .executeTakeFirstOrThrow();
    res.json({
      allowUnrestricted: w.allow_unrestricted_reviews,
      emailAvailable: !!emailConfig(),
    });
  }),
);
reviewManagementRouter.patch(
  "/settings",
  route(async (req, res) => {
    const b = parse(
      z.object({ allowUnrestricted: z.boolean() }).strict(),
      req.body,
    );
    const workspaceId = auth(req).workspaceId;
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("workspaces")
        .set({ allow_unrestricted_reviews: b.allowUnrestricted })
        .where("id", "=", workspaceId)
        .execute();
      if (!b.allowUnrestricted) {
        const revoked = await trx
          .updateTable("external_reviews")
          .set({ revoked_at: new Date() })
          .where("workspace_id", "=", workspaceId)
          .where("reviewer_email", "is", null)
          .where("revoked_at", "is", null)
          .returning("id")
          .execute();
        if (revoked.length)
          await trx
            .insertInto("external_review_events")
            .values(
              revoked.map((r) => ({ review_id: r.id, event_type: "revoked" })),
            )
            .execute();
      }
    });
    res.json({ allowUnrestricted: b.allowUnrestricted });
  }),
);
reviewManagementRouter.get(
  "/",
  route(async (req, res) => {
    const rows = await db
      .selectFrom("external_reviews as r")
      .innerJoin("projects as p", "p.id", "r.project_id")
      .leftJoin("users as u", "u.id", "r.created_by")
      .select([
        "r.id",
        "r.title",
        "r.instructions",
        "r.project_id",
        "p.name as project_name",
        "r.created_at",
        "r.expires_at",
        "r.revoked_at",
        "r.reviewer_email",
        "r.show_links",
        "r.access_count",
        "r.last_accessed_at",
        "u.name as creator",
      ])
      .where("r.workspace_id", "=", auth(req).workspaceId)
      .orderBy("r.created_at", "desc")
      .execute();
    const ids = rows.map((r) => r.id);
    const selected = ids.length
      ? await db
          .selectFrom("external_review_issues")
          .select(["review_id", "issue_id"])
          .where("review_id", "in", ids)
          .execute()
      : [];
    res
      .set("Cache-Control", "no-store")
      .json(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          instructions: r.instructions,
          projectId: r.project_id,
          projectName: r.project_name,
          creator: r.creator,
          createdAt: r.created_at,
          expiresAt: r.expires_at,
          revokedAt: r.revoked_at,
          emailRestricted: !!r.reviewer_email,
          reviewerEmail: r.reviewer_email,
          showLinks: r.show_links,
          accessCount: r.access_count,
          lastAccessedAt: r.last_accessed_at,
          issueIds: selected
            .filter((s) => s.review_id === r.id)
            .map((s) => s.issue_id),
        })),
      );
  }),
);
reviewManagementRouter.post(
  "/",
  route(async (req, res) => {
    const b = parse(input, req.body),
      ctx = auth(req),
      expires = validExpiry(b.expiresAt);
    if (config.isProd && !config.secureCookies)
      throw forbidden("External reviews require an HTTPS application URL");
    if (b.reviewerEmail && !emailConfig())
      throw badRequest("Email verification is not configured on this server");
    const ws = await db
      .selectFrom("workspaces")
      .select("allow_unrestricted_reviews")
      .where("id", "=", ctx.workspaceId)
      .executeTakeFirstOrThrow();
    if (!b.reviewerEmail && !ws.allow_unrestricted_reviews)
      throw forbidden(
        "An administrator must enable unrestricted review links first",
      );
    await checkSelection(ctx.workspaceId, b.projectId, b.issueIds);
    const token = newToken();
    const r = await db.transaction().execute(async (trx) => {
      const locked = await trx
        .selectFrom("workspaces")
        .select("allow_unrestricted_reviews")
        .where("id", "=", ctx.workspaceId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (!b.reviewerEmail && !locked.allow_unrestricted_reviews)
        throw forbidden(
          "An administrator must enable unrestricted review links first",
        );
      const row = await trx
        .insertInto("external_reviews")
        .values({
          workspace_id: ctx.workspaceId,
          project_id: b.projectId,
          created_by: ctx.userId,
          token_hash: token.hash,
          title: b.title,
          instructions: b.instructions,
          expires_at: expires,
          revoked_at: null,
          reviewer_email: b.reviewerEmail?.toLowerCase() ?? null,
          show_links: b.showLinks,
          last_accessed_at: null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("external_review_issues")
        .values(
          b.issueIds.map((issueId) => ({
            review_id: row.id,
            issue_id: issueId,
          })),
        )
        .execute();
      await trx
        .insertInto("external_review_events")
        .values({ review_id: row.id, event_type: "created" })
        .execute();
      return row;
    });
    res
      .set("Cache-Control", "no-store")
      .status(201)
      .json({ id: r.id, url: `${config.appOrigin}/review#${token.token}` });
  }),
);
reviewManagementRouter.patch(
  "/:id",
  route(async (req, res) => {
    const id = parse(uuid, param(req, "id")),
      ctx = auth(req);
    const existing = await db
      .selectFrom("external_reviews")
      .selectAll()
      .where("id", "=", id)
      .where("workspace_id", "=", ctx.workspaceId)
      .executeTakeFirst();
    if (!existing) throw notFound("Review");
    if (existing.revoked_at)
      throw badRequest("A revoked review cannot be reactivated");
    const b = parse(input, req.body);
    if (b.projectId !== existing.project_id)
      throw badRequest("The review project cannot be changed");
    if ((b.reviewerEmail?.toLowerCase() ?? null) !== existing.reviewer_email)
      throw badRequest(
        "Email restriction cannot be changed; create a new review",
      );
    await checkSelection(ctx.workspaceId, b.projectId, b.issueIds);
    const expiry = validExpiry(b.expiresAt);
    await db.transaction().execute(async (trx) => {
      const updated = await trx
        .updateTable("external_reviews")
        .set({
          title: b.title,
          instructions: b.instructions,
          expires_at: expiry,
          show_links: b.showLinks,
          updated_at: new Date(),
        })
        .where("id", "=", id)
        .where("workspace_id", "=", ctx.workspaceId)
        .where("revoked_at", "is", null)
        .returning("id")
        .executeTakeFirst();
      if (!updated) throw badRequest("A revoked review cannot be edited");
      await trx
        .deleteFrom("external_review_issues")
        .where("review_id", "=", id)
        .execute();
      await trx
        .insertInto("external_review_issues")
        .values(
          b.issueIds.map((issueId) => ({ review_id: id, issue_id: issueId })),
        )
        .execute();
      await trx
        .insertInto("external_review_events")
        .values({ review_id: id, event_type: "updated" })
        .execute();
    });
    res.json({ ok: true });
  }),
);
reviewManagementRouter.post(
  "/:id/revoke",
  route(async (req, res) => {
    const id = parse(uuid, param(req, "id"));
    const row = await db
      .updateTable("external_reviews")
      .set({ revoked_at: new Date(), updated_at: new Date() })
      .where("id", "=", id)
      .where("workspace_id", "=", auth(req).workspaceId)
      .where("revoked_at", "is", null)
      .returning("id")
      .executeTakeFirst();
    if (!row) throw notFound("Review");
    await event(id, "revoked");
    res.json({ ok: true });
  }),
);
reviewManagementRouter.get(
  "/:id/events",
  route(async (req, res) => {
    const id = parse(uuid, param(req, "id"));
    const row = await db
      .selectFrom("external_reviews")
      .select("id")
      .where("id", "=", id)
      .where("workspace_id", "=", auth(req).workspaceId)
      .executeTakeFirst();
    if (!row) throw notFound("Review");
    const events = await db
      .selectFrom("external_review_events")
      .select(["event_type", "created_at"])
      .where("review_id", "=", id)
      .orderBy("created_at", "desc")
      .limit(200)
      .execute();
    res.set("Cache-Control", "no-store").json(events);
  }),
);
reviewManagementRouter.delete(
  "/:id",
  route(async (req, res) => {
    const id = parse(uuid, param(req, "id"));
    const r = await db
      .deleteFrom("external_reviews")
      .where("id", "=", id)
      .where("workspace_id", "=", auth(req).workspaceId)
      .where("expires_at", "<", new Date())
      .returning("id")
      .executeTakeFirst();
    if (!r) throw notFound("Expired review");
    res.status(204).end();
  }),
);

// The token is carried in an Authorization header, never in an API URL or query string.
reviewerRouter.use((req, res, next) => {
  res.set({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  });
  next();
});
reviewerRouter.use(
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Try again later." },
  }),
);
async function findReview(req: import("express").Request) {
  const raw = req
    .get("Authorization")
    ?.match(/^Review ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!raw) throw notFound("Review");
  const r = await db
    .selectFrom("external_reviews as r")
    .innerJoin("projects as p", "p.id", "r.project_id")
    .innerJoin("workspaces as w", "w.id", "r.workspace_id")
    .select([
      "w.allow_unrestricted_reviews",
      "r.id",
      "r.workspace_id",
      "r.project_id",
      "r.title",
      "r.instructions",
      "r.expires_at",
      "r.revoked_at",
      "r.reviewer_email",
      "r.show_links",
      "p.name as project_name",
      "p.project_key",
    ])
    .where("r.token_hash", "=", hashToken(raw))
    .executeTakeFirst();
  if (!r) throw notFound("Review");
  if (
    (!r.reviewer_email && !r.allow_unrestricted_reviews) ||
    r.revoked_at ||
    (r.expires_at && r.expires_at.getTime() <= Date.now())
  ) {
    await event(
      r.id,
      r.revoked_at || (!r.reviewer_email && !r.allow_unrestricted_reviews)
        ? "access_denied"
        : "expired",
    );
    throw notFound("Review");
  }
  return r;
}
async function verified(req: import("express").Request, reviewId: string) {
  const raw = req.get("X-Review-Session");
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return false;
  return !!(await db
    .selectFrom("external_review_sessions")
    .select("id")
    .where("id", "=", hashToken(raw))
    .where("review_id", "=", reviewId)
    .where("expires_at", ">", new Date())
    .executeTakeFirst());
}
reviewerRouter.get(
  "/",
  route(async (req, res) => {
    const r = await findReview(req);
    if (r.reviewer_email && !(await verified(req, r.id)))
      return res.json({ requiresVerification: true });
    const data = await db.transaction().execute(async (trx) => {
      // Serialize reads with revocation and edits, so a completed revoke cannot race a stale selection.
      const current = await trx
        .selectFrom("external_reviews")
        .select([
          "id",
          "title",
          "instructions",
          "expires_at",
          "revoked_at",
          "show_links",
        ])
        .where("id", "=", r.id)
        .forUpdate()
        .executeTakeFirst();
      if (
        !current ||
        current.revoked_at ||
        (current.expires_at && current.expires_at.getTime() <= Date.now())
      )
        throw notFound("Review");
      const issues = await trx
        .selectFrom("external_review_issues as s")
        .innerJoin("issues as i", "i.id", "s.issue_id")
        .innerJoin("projects as p", "p.id", "i.project_id")
        .select([
          "i.id",
          "i.issue_number",
          "i.summary",
          "i.description",
          "i.status",
          "i.type",
          "p.project_key",
        ])
        .where("s.review_id", "=", r.id)
        .where("p.id", "=", r.project_id)
        .where("p.workspace_id", "=", r.workspace_id)
        .orderBy("i.issue_number")
        .execute();
      const issueIds = issues.map((i) => i.id);
      const links =
        current.show_links && issueIds.length
          ? await trx
              .selectFrom("issue_relationships")
              .select([
                "source_issue_id",
                "target_issue_id",
                "relationship_type",
              ])
              .where("workspace_id", "=", r.workspace_id)
              .where("source_issue_id", "in", issueIds)
              .where("target_issue_id", "in", issueIds)
              .execute()
          : [];
      await trx
        .updateTable("external_reviews")
        .set({
          access_count: sql`access_count + 1`,
          last_accessed_at: new Date(),
        })
        .where("id", "=", r.id)
        .execute();
      await trx
        .insertInto("external_review_events")
        .values({ review_id: r.id, event_type: "accessed" })
        .execute();
      return {
        requiresVerification: false,
        title: current.title,
        instructions: current.instructions,
        projectName: r.project_name,
        expiresAt: current.expires_at,
        issues: issues.map((i) => ({
          id: i.id,
          key: `${i.project_key}-${i.issue_number}`,
          title: i.summary,
          description: i.description,
          status: i.status,
          type: i.type,
        })),
        links: links.map((l) => ({
          sourceId: l.source_issue_id,
          targetId: l.target_issue_id,
          type: l.relationship_type,
        })),
      };
    });
    res.json(data);
  }),
);
const otpLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many verification requests. Try again later." },
});
reviewerRouter.post(
  "/challenge",
  otpLimit,
  route(async (req, res) => {
    const r = await findReview(req),
      smtp = emailConfig();
    if (!r.reviewer_email || !smtp)
      throw badRequest("Email verification is unavailable");
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const now = new Date();
    const challenge = await db
      .insertInto("external_review_challenges")
      .values({
        review_id: r.id,
        code_hash: otpHash(r.id, code, smtp.secret),
        expires_at: new Date(Date.now() + 10 * 60_000),
        sent_at: now,
        attempts: 0,
      })
      .onConflict((oc) =>
        oc
          .column("review_id")
          .doUpdateSet({
            code_hash: otpHash(r.id, code, smtp.secret),
            expires_at: new Date(Date.now() + 10 * 60_000),
            sent_at: now,
            attempts: 0,
          })
          .where(
            "external_review_challenges.sent_at",
            "<",
            new Date(Date.now() - 60_000),
          ),
      )
      .returning("review_id")
      .executeTakeFirst();
    if (!challenge)
      throw badRequest("Please wait a minute before requesting another code");
    await event(r.id, "verification_requested");
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: config.NODE_ENV !== "test" && !smtp.secure,
      auth:
        smtp.user && smtp.pass
          ? { user: smtp.user, pass: smtp.pass }
          : undefined,
    });
    try {
      await transport.sendMail({
        from: smtp.from,
        to: r.reviewer_email,
        subject: "Solution Velocity review verification code",
        text: `Your verification code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`,
      });
    } catch {
      await db
        .deleteFrom("external_review_challenges")
        .where("review_id", "=", r.id)
        .execute();
      throw new Error("Review verification delivery failed");
    } finally {
      transport.close();
    }
    res.json({ sent: true });
  }),
);
reviewerRouter.post(
  "/verify",
  otpLimit,
  route(async (req, res) => {
    const r = await findReview(req),
      smtp = emailConfig();
    if (!r.reviewer_email || !smtp)
      throw badRequest("Email verification is unavailable");
    const b = parse(
      z.object({ code: z.string().regex(/^\d{6}$/) }).strict(),
      req.body,
    );
    const row = await db
      .updateTable("external_review_challenges")
      .set({ attempts: sql`attempts + 1` })
      .where("review_id", "=", r.id)
      .where("expires_at", ">", new Date())
      .where("attempts", "<", 5)
      .returning(["code_hash", "attempts"])
      .executeTakeFirst();
    await event(r.id, "verification_attempted");
    if (!row || !sameHash(row.code_hash, otpHash(r.id, b.code, smtp.secret)))
      throw forbidden("Invalid or expired verification code");
    const token = newToken();
    const expiry = new Date(
      Math.min(Date.now() + 12 * 3600_000, r.expires_at?.getTime() ?? Infinity),
    );
    await db.transaction().execute(async (trx) => {
      const deleted = await trx
        .deleteFrom("external_review_challenges")
        .where("review_id", "=", r.id)
        .where("code_hash", "=", row.code_hash)
        .returning("review_id")
        .executeTakeFirst();
      if (!deleted) throw forbidden("Verification code already used");
      await trx
        .insertInto("external_review_sessions")
        .values({ id: token.hash, review_id: r.id, expires_at: expiry })
        .execute();
      await trx
        .insertInto("external_review_events")
        .values({ review_id: r.id, event_type: "verification_completed" })
        .execute();
    });
    res.json({ session: token.token });
  }),
);
