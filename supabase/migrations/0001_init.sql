-- =========================================================
-- Ello AI Voice Agent Ecosystem — Supabase Schema
-- =========================================================
-- Run this in the Supabase SQL Editor (or via `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- 1. BUSINESSES — one row per tenant/client/vertical account
--    (LeadPulse is multi-tenant, so this is the top-level scope)
-- ---------------------------------------------------------
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vertical text not null,                 -- 'real_estate', 'insurance', 'chit_fund', ...
  getello_agent_id text not null,         -- e.g. 6a323481d382b88fe369920f
  getello_api_key_secret_name text not null, -- name of the secret in Supabase Vault — never the raw key
  default_callback_hours int default 24,  -- fallback when the caller is vague ("call me later")
  owner_user_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 2. PROJECT TYPES — reusable, owner-editable defaults per vertical
--    (this is the "auto-filled, business owner can edit" content
--     from your Real Estate example: Default Description +
--     Special Attractions checkboxes)
-- ---------------------------------------------------------
create table project_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade, -- null = global template
  name text not null,
  default_description text,
  special_attractions jsonb default '[]'::jsonb, -- ["Approved layout", "Wide roads", ...]
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 3. LEADS — captured from the website "Contact Us" intake form
-- ---------------------------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  user_name text not null,
  phone_number text not null,
  email text,
  scheduled_datetime timestamptz,         -- requested callback slot from the form
  project_type_id uuid references project_types(id),
  custom_description text,                -- owner override for this specific lead
  selected_attractions jsonb,             -- subset of checkboxes the owner kept/edited
  language_preference text,               -- 'en' | 'te' | 'hi' | 'ta' | 'mr' ... captured on the form
  source text default 'website_form',
  status text default 'new',              -- new | queued | called | converted | lost
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 4. CUSTOMERS — canonical identity, deduped by phone number
-- ---------------------------------------------------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  phone_number text not null,
  name text,
  email text,
  preferred_language text default 'en', -- 'en' | 'te' | 'hi' | 'ta' | 'mr' ...
  created_at timestamptz default now(),
  unique (business_id, phone_number)
);

-- ---------------------------------------------------------
-- 5. CALLS — every actual voice call placed through Getello
-- ---------------------------------------------------------
create table calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  lead_id uuid references leads(id),
  getello_call_id text,                   -- id Getello returns, if any
  context_data_sent jsonb,                -- exact payload sent, kept for audit/debugging
  call_status text default 'initiated',   -- initiated | completed | no_answer | voicemail | failed
  started_at timestamptz default now(),
  ended_at timestamptz,
  raw_transcript text
);

-- ---------------------------------------------------------
-- 6. CALL SUMMARIES — structured extraction after each call
-- ---------------------------------------------------------
create table call_summaries (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references calls(id) on delete cascade,
  summary_text text,
  structured_data jsonb,      -- {interest_level, budget_window, project_size, objections, sentiment}
  disposition text,           -- interested | callback_requested | not_interested | converted | lost
  next_action text,
  next_call_at timestamptz,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 7. SCHEDULED CALLBACKS — drives the automatic re-dial
-- ---------------------------------------------------------
create table scheduled_callbacks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  lead_id uuid references leads(id),
  scheduled_time timestamptz not null,
  status text default 'pending',  -- pending | triggered | completed | cancelled
  attempt_count int default 0,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 8. AGENT PROMPTS — version history for the live Getello system prompt
-- ---------------------------------------------------------
create table agent_prompts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  prompt_text text not null,
  prompt_type text default 'hybrid',   -- Getello's agent "type" field
  pushed_at timestamptz default now(),
  pushed_by uuid references auth.users(id),
  is_active boolean default true       -- true = currently live on the Getello agent
);

create index idx_agent_prompts_business on agent_prompts(business_id, pushed_at desc);

alter table agent_prompts enable row level security;
create policy "owner can manage own prompt history"
  on agent_prompts for all
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

-- ---------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------
create index idx_calls_customer on calls(customer_id);
create index idx_summaries_call on call_summaries(call_id);
create index idx_callbacks_pending on scheduled_callbacks(status, scheduled_time);
create index idx_customers_phone on customers(business_id, phone_number);
create index idx_leads_business on leads(business_id, status);

-- ---------------------------------------------------------
-- Row Level Security (starter policy — extend before production)
-- Scopes every business-owned table to its owner_user_id via businesses.
-- ---------------------------------------------------------
alter table businesses enable row level security;
alter table leads enable row level security;
alter table customers enable row level security;
alter table calls enable row level security;
alter table call_summaries enable row level security;
alter table scheduled_callbacks enable row level security;

create policy "owner can manage own business"
  on businesses for all
  using (owner_user_id = auth.uid());

create policy "owner can see own leads"
  on leads for all
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

create policy "owner can see own customers"
  on customers for all
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

create policy "owner can see own calls"
  on calls for all
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

create policy "owner can see own summaries"
  on call_summaries for all
  using (call_id in (
    select id from calls where business_id in (
      select id from businesses where owner_user_id = auth.uid()
    )
  ));

create policy "owner can see own callbacks"
  on scheduled_callbacks for all
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

-- ---------------------------------------------------------
-- Seed: the 12 default project types from your Real Estate spec
-- (business_id left NULL = global template; clone per business on onboarding)
-- ---------------------------------------------------------
insert into project_types (name, default_description, special_attractions) values

('Residential Plots',
 'This project offers residential plots suitable for constructing independent houses or villas. Buyers can select plots based on preferred size, facing, location and budget. The project may include internal roads, electricity, drainage, water facilities, landscaping, security and community amenities.',
 '["Approved residential layout","Clear plot demarcation","Multiple plot sizes and facing options","Wide internal roads","Electricity and water facilities","Suitable for immediate construction","Gated-community features","Nearby schools, hospitals and markets","Good future development potential"]'),

('Agricultural / Farm Land',
 'This project offers agricultural or farm land suitable for cultivation, investment, farmhouse development, weekend use or long-term land ownership. The property may include road access, water availability, fencing, plantation and electricity, subject to applicable land-use regulations.',
 '["Fertile and usable land","Road access to the property","Borewell or water-source availability","Electricity connectivity","Fencing and clear boundaries","Existing plantation or crop potential","Suitable for farmhouse development","Peaceful natural surroundings","Long-term land appreciation potential"]'),

('Independent Houses / Villas',
 'This project offers independent houses or villas for families seeking privacy, dedicated land ownership and spacious living. The properties may include multiple bedrooms, parking, balconies, private open areas, modern interiors and community amenities.',
 '["Independent land ownership","Private parking","Spacious bedrooms and living areas","Modern elevation and interiors","Balcony, terrace or private garden","Gated-community environment","Children''s play area","Clubhouse or community facilities","Ready-to-move or customisation options"]'),

('Apartments / Flats',
 'This residential project offers apartments or flats in configurations such as 1 BHK, 2 BHK, 3 BHK or larger units. The project may include lifts, parking, security, power backup, common areas and recreational facilities.',
 '["Multiple apartment configurations","Vastu-friendly floor plans","Lift and power backup","Covered parking","CCTV and security","Clubhouse and indoor facilities","Gym, play area and walking track","Good ventilation and natural lighting","Convenient access to schools, offices and hospitals"]'),

('Commercial Shops / Showrooms',
 'This project offers commercial shops or showrooms suitable for retail stores, supermarkets, pharmacies, restaurants, branded outlets and service businesses. The spaces may provide good road visibility, customer access, parking and signage opportunities.',
 '["Main-road frontage","High visibility and branding potential","Strong customer footfall","Suitable for branded businesses","Flexible shop or showroom sizes","Parking availability","Easy loading and unloading access","Near residential and commercial areas","Suitable for retail, food and service businesses"]'),

('Office Spaces',
 'This project offers office spaces suitable for companies, startups, professionals, clinics, consultancies and service businesses. The property may include flexible floor plans, parking, lifts, security, power backup and internet connectivity provisions.',
 '["Professional business location","Flexible office layouts","Ready-to-use office infrastructure","Lift and parking facilities","Power backup","High-speed internet provisions","Reception and meeting-room options","Suitable for startups and established companies","Easy access for employees and clients"]'),

('Commercial Buildings',
 'This project offers an entire commercial building or multiple commercial floors suitable for offices, retail businesses, hospitals, educational institutions, financial organisations or corporate operations.',
 '["Complete building or floor-wise availability","Independent entrance and access","Prominent road-facing location","Large branding and signage area","Lift and staircase facilities","Dedicated parking","Flexible commercial usage","Suitable for banks, hospitals and institutions","Long-term rental-income potential"]'),

('Warehouses / Industrial Properties',
 'This project offers warehouses, industrial sheds or commercial land suitable for storage, logistics, manufacturing, distribution and business operations. The property may include wide-road access, loading areas, power availability and security.',
 '["Wide-road and heavy-vehicle access","Large storage or production area","Loading and unloading facilities","High roof clearance","Industrial power availability","Security and boundary fencing","Parking for trucks and commercial vehicles","Near highways or logistics routes","Suitable for manufacturing and distribution"]'),

('Mixed-Use Projects',
 'This project combines residential, commercial, office or retail spaces within a single integrated development. It is designed to offer homes, businesses, shopping and essential services in one convenient location.',
 '["Residential and commercial spaces together","Shops and essential services within the project","Better convenience for residents","Strong business and rental potential","Multiple investment opportunities","Planned parking and internal roads","Community amenities","High customer and resident footfall","Suitable for both investors and end users"]'),

('Rental / Lease Properties',
 'This property is available for residential or commercial rental or lease. It may be suitable for families, companies, retail brands, offices, institutions or other business users, depending on the property type and location.',
 '["Ready for immediate occupancy","Flexible rental or lease terms","Suitable for residential or business use","Prime or convenient location","Parking and access facilities","Good road visibility","Branding opportunities for commercial tenants","Long-term lease options","Property maintenance support"]'),

('Resale Properties',
 'This listing includes an existing property being offered for resale by its current owner or authorised representative. The property may be ready for immediate possession and can include land, houses, apartments, villas or commercial spaces.',
 '["Ready for immediate possession","Established neighbourhood","Existing utilities and infrastructure","No construction waiting period","Potential price advantage","Verified ownership documents","Loan eligibility, where applicable","Renovation or customisation potential","Nearby schools, hospitals and commercial facilities"]'),

('Other',
 'This category is for properties or real-estate projects that do not fall under the listed options. The owner can provide details about the property type, location, size, intended use, development status and selling or leasing requirements.',
 '["Unique property category","Custom development potential","Flexible usage options","Strategic location advantages","Investment or income-generation potential","Available infrastructure and facilities","Nearby landmarks and connectivity","Special approvals or permissions","Features unique to the property"]');
