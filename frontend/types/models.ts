/**
 * Short names for the API's types. Everything here comes from types/api.d.ts, which is generated from the
 * backend's OpenAPI schema (`npm run api:types`); edit the backend models, not these.
 */
import type { components } from "./api";

type Schemas = components["schemas"];

export type ReportSummary = Schemas["ReportSummary"];
export type SessionSummary = Schemas["SessionSummary"];
export type SessionConfig = Schemas["SessionConfig"];
export type MentorWelcome = Schemas["MentorWelcome"];
export type PlanSummary = Schemas["PlanSummary"];
export type TokenPair = Schemas["TokenPair"];
export type AuthResponse = Schemas["AuthResponse"];
export type MeOut = Schemas["MeOut"];
export type ProfileOut = Schemas["ProfileOut"];
export type ProfileCreate = Schemas["ProfileCreate"];
export type ProfileUpdate = Schemas["ProfileUpdate"];
export type LoginRequest = Schemas["LoginRequest"];
export type RegisterRequest = Schemas["RegisterRequest"];
export type InterviewConfigRequest = Schemas["InterviewConfigRequest"];
export type ValidationErrorItem = Schemas["ValidationError"];
