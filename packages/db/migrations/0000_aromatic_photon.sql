CREATE SCHEMA "ledger";
--> statement-breakpoint
CREATE SCHEMA "op";
--> statement-breakpoint
CREATE TYPE "public"."claim_event_type" AS ENUM('original', 'correction', 'retraction');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('up', 'down');--> statement-breakpoint
CREATE TYPE "public"."exposure_state" AS ENUM('exposed', 'blind');--> statement-breakpoint
CREATE TYPE "public"."mechanism_type" AS ENUM('inventory_print', 'rate_decision', 'earnings_surprise', 'macro_release');--> statement-breakpoint
CREATE TABLE "ledger"."agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"operator_note" text,
	"agent_signature" "bytea",
	"server_countersig" "bytea",
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger"."agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" uuid NOT NULL,
	"pubkey" "bytea" NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"display_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger"."claim_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_claim_id" uuid NOT NULL,
	"event_type" "claim_event_type" NOT NULL,
	"replacement_claim_id" uuid,
	"server_countersig" "bytea" NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger"."claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"config_hash" text NOT NULL,
	"exposure_state" "exposure_state" NOT NULL,
	"assignment_window" text NOT NULL,
	"instrument" text NOT NULL,
	"direction" "direction" NOT NULL,
	"confidence" numeric(5, 4) NOT NULL,
	"mechanism_type" "mechanism_type" NOT NULL,
	"mechanism_params" jsonb NOT NULL,
	"falsifier" jsonb NOT NULL,
	"horizon_ends_at" timestamp with time zone NOT NULL,
	"reference_price" numeric(20, 8) NOT NULL,
	"rationale_text" text,
	"sealed_commit" "bytea",
	"agent_signature" "bytea" NOT NULL,
	"server_countersig" "bytea" NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nonce_digest" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger"."configs" (
	"hash" text PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"model_version" text NOT NULL,
	"system_prompt" text NOT NULL,
	"tool_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger"."merkle_roots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_label" text NOT NULL,
	"root" text NOT NULL,
	"leaf_count" integer NOT NULL,
	"server_signature" "bytea" NOT NULL,
	"publication_url" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "op"."nonces" (
	"digest" text PRIMARY KEY NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "op"."oauth_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"operator_id" uuid NOT NULL,
	"scopes" text[] NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "op"."operator_auth" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" uuid NOT NULL,
	"oidc_subject" text NOT NULL,
	"oidc_issuer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger"."operators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"payment_fingerprint" text,
	"consented_at" timestamp with time zone,
	"consent_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger"."resolutions" (
	"claim_id" uuid PRIMARY KEY NOT NULL,
	"outcome" boolean NOT NULL,
	"mechanism_hit" boolean NOT NULL,
	"resolution_price" numeric(20, 8) NOT NULL,
	"benchmark_return" numeric(12, 8) NOT NULL,
	"instrument_return" numeric(12, 8) NOT NULL,
	"beat_benchmark" boolean NOT NULL,
	"brier_score" numeric(8, 6) NOT NULL,
	"sources" jsonb NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger"."sealed_reveals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"revealed_payload" jsonb NOT NULL,
	"reveal_nonce" text NOT NULL,
	"server_countersig" "bytea" NOT NULL,
	"revealed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger"."agent_events" ADD CONSTRAINT "agent_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "ledger"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."agents" ADD CONSTRAINT "agents_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "ledger"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."claim_events" ADD CONSTRAINT "claim_events_original_claim_id_claims_id_fk" FOREIGN KEY ("original_claim_id") REFERENCES "ledger"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."claim_events" ADD CONSTRAINT "claim_events_replacement_claim_id_claims_id_fk" FOREIGN KEY ("replacement_claim_id") REFERENCES "ledger"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."claims" ADD CONSTRAINT "claims_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "ledger"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."claims" ADD CONSTRAINT "claims_config_hash_configs_hash_fk" FOREIGN KEY ("config_hash") REFERENCES "ledger"."configs"("hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."resolutions" ADD CONSTRAINT "resolutions_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "ledger"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."sealed_reveals" ADD CONSTRAINT "sealed_reveals_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "ledger"."claims"("id") ON DELETE no action ON UPDATE no action;