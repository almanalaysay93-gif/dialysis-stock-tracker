CREATE TYPE "public"."item_category" AS ENUM('dialyzer', 'bloodline', 'needles', 'saline', 'medications', 'disinfectants', 'PPE', 'PD supplies');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('ordered', 'partially-delivered', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."session_shift" AS ENUM('morning', 'afternoon', 'evening');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('in-progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."session_type" AS ENUM('HD', 'PD');--> statement-breakpoint
CREATE TYPE "public"."transaction_reason" AS ENUM('issued', 'adjusted', 'written off', 'returned');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('stock-in', 'stock-out');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "batches" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "batches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"itemId" integer NOT NULL,
	"lotNumber" varchar(80) NOT NULL,
	"supplier" varchar(160),
	"quantityReceived" integer NOT NULL,
	"quantityOnHand" integer NOT NULL,
	"expiryDate" date NOT NULL,
	"isQuarantined" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "consumption_templates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "consumption_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sessionType" "session_type" NOT NULL,
	"itemId" integer NOT NULL,
	"defaultQty" integer NOT NULL,
	"label" varchar(120),
	"isActive" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consumption_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(160) NOT NULL,
	"category" "item_category" NOT NULL,
	"unitOfMeasure" varchar(32) NOT NULL,
	"minStockLevel" integer DEFAULT 0 NOT NULL,
	"reorderLevel" integer DEFAULT 0 NOT NULL,
	"description" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_order_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"poId" integer NOT NULL,
	"itemId" integer NOT NULL,
	"quantityOrdered" integer NOT NULL,
	"quantityReceived" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"poNumber" varchar(40) NOT NULL,
	"supplier" varchar(160) NOT NULL,
	"status" "purchase_order_status" DEFAULT 'ordered' NOT NULL,
	"expectedDeliveryDate" date NOT NULL,
	"actualDeliveryDate" date,
	"itemsSummary" text,
	"notes" text,
	"createdBy" varchar(120),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "session_consumables" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "session_consumables_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"sessionId" bigint NOT NULL,
	"itemId" integer NOT NULL,
	"batchId" integer,
	"quantity" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_consumables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_transactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"itemId" integer NOT NULL,
	"batchId" integer,
	"type" "transaction_type" NOT NULL,
	"reason" "transaction_reason" NOT NULL,
	"quantity" integer NOT NULL,
	"supplier" varchar(160),
	"lotNumber" varchar(80),
	"expiryDate" date,
	"notes" text,
	"performedBy" varchar(120),
	"performedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "treatment_sessions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "treatment_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"patientName" varchar(160) NOT NULL,
	"chair" varchar(16) NOT NULL,
	"shift" "session_shift" NOT NULL,
	"sessionType" "session_type" NOT NULL,
	"sessionDate" date NOT NULL,
	"status" "session_status" DEFAULT 'in-progress' NOT NULL,
	"createdBy" varchar(120),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "treatment_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" varchar(64) NOT NULL,
	"passwordHash" text NOT NULL,
	"name" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;