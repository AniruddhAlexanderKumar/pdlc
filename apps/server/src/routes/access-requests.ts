import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import {
  ACCESS_REQUEST_INDUSTRIES,
  ACCESS_REQUEST_ROLES,
  ACCESS_REQUEST_STAGES,
  ACCESS_REQUEST_TEAM_SIZES,
  calculatePricing,
  calculateEducationPricing,
} from "@sv/shared";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { pricingSelection, educationPricingSelection } from '../lib/pricing.js';
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
  teamSize: z.enum(ACCESS_REQUEST_TEAM_SIZES).optional(),
  productStage: z.enum(ACCESS_REQUEST_STAGES).optional(),
  currentTools: shortText(500).default(""),
  country: shortText(120).min(1).optional(),
  pricing: pricingSelection.optional(),
  goals: shortText(2000).min(
    10,
    "Tell us a little more about what you would like to improve",
  ),
}).superRefine((value, ctx) => {
  // Legacy clients can still submit the old form; priced requests must supply the new details.
  if (value.pricing && !value.country) ctx.addIssue({ code: 'custom', path: ['country'], message: 'Country is required for a pricing request' });
  if (value.pricing && !value.teamSize) ctx.addIssue({ code: 'custom', path: ['teamSize'], message: 'Organisation size is required for a pricing request' });
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
        team_size: body.teamSize ?? null,
        product_stage: body.productStage ?? null,
        current_tools: body.currentTools,
        goals: body.goals,
        country: body.country ?? null,
        pricing_snapshot: body.pricing ? JSON.stringify(calculatePricing(body.pricing.plan, body.pricing.editors, body.pricing.billing)) : null,
      })
      .returning(["id", "status"])
      .executeTakeFirstOrThrow();

    res.status(201).json({ id: request.id, status: request.status });
  }),
);


const educationRequestSchema = z.object({
 name: shortText(100).min(1), email: emailSchema, institution: shortText(120), role: shortText(100), country: shortText(120).min(1),
 educationalLevel: shortText(120), teacherCount: z.number().int().min(0).max(100000).nullable(), programmes: shortText(1000), campuses: z.number().int().min(1).max(100000).nullable(), specialRequirements: shortText(2000), goals: shortText(2000).min(10), pricing: educationPricingSelection
}).strict().superRefine((value,ctx)=>{
 const required=(condition:boolean,path:string,message:string)=>{if(condition)ctx.addIssue({code:'custom',path:[path],message});};
 required(value.pricing.plan==='student'&&!value.educationalLevel,'educationalLevel','Educational level is required');
 required(value.pricing.plan!=='student'&&!value.institution,'institution','Institution is required');
 required(value.pricing.plan!=='student'&&!value.role,'role','Contact role is required');
 required(value.pricing.plan==='cohort'&&value.teacherCount===null,'teacherCount','Teacher count is required');
 required(value.pricing.plan==='cohort'&&!value.programmes,'programmes','Educational programmes are required');
 required(value.pricing.plan==='education_enterprise'&&value.campuses===null,'campuses','Campus count is required');
 required(value.pricing.plan==='education_enterprise'&&!value.specialRequirements,'specialRequirements','Describe your special requirements');
});
accessRequestsRouter.post('/education', submissionLimiter, route(async(req,res)=>{
 const b=parse(educationRequestSchema,req.body); const quote=calculateEducationPricing(b.pricing.plan,b.pricing.students,b.pricing.billing);
 const row=await db.insertInto('access_requests').values({name:b.name,email:b.email,organization:b.institution,role:b.pricing.plan==='student'?'Student':b.role,industry:'Education',team_size:null,product_stage:null,country:b.country,current_tools:'',goals:b.goals,pricing_snapshot:null,education_details:JSON.stringify({educationalLevel:b.educationalLevel,teacherCount:b.teacherCount,programmes:b.programmes,campuses:b.campuses,specialRequirements:b.specialRequirements}),education_pricing_snapshot:JSON.stringify(quote)}).returning(['id','status']).executeTakeFirstOrThrow();
 res.status(201).json(row);
}));
