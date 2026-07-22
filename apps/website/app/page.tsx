import { createClient } from "@supabase/supabase-js";
import ContactForm, { type ProjectType } from "./ContactForm";

// Always fetch fresh project types (owner can edit them in the dashboard).
export const dynamic = "force-dynamic";

async function getProjectTypes(): Promise<ProjectType[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];

  try {
    const supabase = createClient(url, key);
    const businessId = process.env.NEXT_PUBLIC_BUSINESS_ID;

    let query = supabase
      .from("project_types")
      .select("id, name, default_description, special_attractions")
      .eq("is_active", true);

    // Global templates (business_id IS NULL) plus this business's own types.
    query = businessId
      ? query.or(`business_id.is.null,business_id.eq.${businessId}`)
      : query.is("business_id", null);

    const { data, error } = await query.order("name");
    if (error) return [];
    return (data ?? []) as ProjectType[];
  } catch {
    return [];
  }
}

const LANGUAGES = ["English", "Telugu", "Hindi", "Tamil", "Marathi"];

const STEPS = [
  {
    n: "1",
    title: "Share your requirement",
    body: "Tell us the property type, budget, and when to reach you. Takes about 30 seconds.",
  },
  {
    n: "2",
    title: "Get an instant callback",
    body: "Our specialist calls you back — in your preferred language — to understand exactly what you need.",
  },
  {
    n: "3",
    title: "Personalised follow-up",
    body: "Every conversation is remembered, so each follow-up picks up right where you left off.",
  },
];

const FEATURES = [
  {
    title: "Speaks your language",
    body: "English, Telugu, Hindi, Tamil, or Marathi — and comfortable with code-mixed conversation.",
  },
  {
    title: "Calls when it suits you",
    body: "Pick a callback time on the form and we ring you back within your window.",
  },
  {
    title: "Remembers every call",
    body: "No repeating yourself — each callback continues from your last conversation.",
  },
  {
    title: "Consultative, never pushy",
    body: "A helpful specialist who listens first and suggests the right next step.",
  },
];

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
        <a href="#top" className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-sm text-white">E</span>
          <span>Ello Real Estate</span>
        </a>
        <nav className="hidden items-center gap-6 text-sm text-gray-600 sm:flex">
          <a href="#services" className="hover:text-gray-900">Services</a>
          <a href="#how" className="hover:text-gray-900">How it works</a>
          <a href="#why" className="hover:text-gray-900">Why us</a>
        </nav>
        <a
          href="#contact"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Request a call
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-gradient-to-b from-blue-50 to-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
            AI-powered real estate
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Find the right property —{" "}
            <span className="text-blue-600">we&apos;ll call you back in minutes.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
            Tell us what you&apos;re looking for. Our specialist calls you back,
            understands your needs, and follows up — so you never miss the right
            opportunity.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#contact"
              className="w-full rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-blue-700 sm:w-auto"
            >
              Request a callback
            </a>
            <a
              href="#services"
              className="w-full rounded-lg border border-gray-300 px-6 py-3 text-base font-semibold text-gray-700 transition hover:bg-gray-50 sm:w-auto"
            >
              Explore services
            </a>
          </div>
          <p className="mt-4 text-sm text-gray-500">
            Available in {LANGUAGES.join(" · ")}
          </p>
        </div>
      </div>
    </section>
  );
}

function Services({ projectTypes }: { projectTypes: ProjectType[] }) {
  return (
    <section id="services" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight">What we help you with</h2>
        <p className="mt-3 text-gray-600">
          From plots to premium commercial space — whatever you&apos;re after, we
          have a specialist ready to help.
        </p>
      </div>

      {projectTypes.length > 0 ? (
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projectTypes.map((p) => (
            <article
              key={p.id}
              className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <h3 className="text-lg font-semibold">{p.name}</h3>
              {p.default_description && (
                <p className="mt-2 line-clamp-3 text-sm text-gray-600">
                  {p.default_description}
                </p>
              )}
              {p.special_attractions && p.special_attractions.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {p.special_attractions.slice(0, 3).map((a, i) => (
                    <li
                      key={i}
                      className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700"
                    >
                      {a}
                    </li>
                  ))}
                </ul>
              )}
              <a
                href="#contact"
                className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                Enquire about this →
              </a>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-12 text-center text-gray-500">
          Our service catalogue is loading — please use the form below to reach us.
        </p>
      )}
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
          <p className="mt-3 text-gray-600">Three simple steps from enquiry to the right property.</p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-blue-600 font-bold text-white">
                {s.n}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="why" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight">Why enquire with us</h2>
        <p className="mt-3 text-gray-600">A follow-up experience built around you.</p>
      </div>
      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex gap-4 rounded-2xl border border-gray-200 p-6">
            <div className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-green-100 text-green-700">
              ✓
            </div>
            <div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{f.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ContactSection({
  projectTypes,
  businessId,
}: {
  projectTypes: ProjectType[];
  businessId: string;
}) {
  return (
    <section id="contact" className="bg-gray-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:py-20 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Request a callback</h2>
          <p className="mt-3 text-gray-600">
            Leave your details and our team will call you back about your
            real-estate enquiry — usually within minutes, at a time that suits you.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-gray-600">
            {[
              "No obligation — a friendly, consultative conversation",
              "Choose your language and preferred callback time",
              "Your details are only used to contact you about this enquiry",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-blue-100 text-xs text-blue-700">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <ContactForm projectTypes={projectTypes} businessId={businessId} />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-gray-500 sm:flex-row">
        <div className="flex items-center gap-2 font-semibold text-gray-700">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-blue-600 text-xs text-white">E</span>
          Ello Real Estate
        </div>
        <p>By requesting a call you consent to being contacted about your enquiry.</p>
      </div>
    </footer>
  );
}

export default async function Home() {
  const projectTypes = await getProjectTypes();
  const businessId = process.env.NEXT_PUBLIC_BUSINESS_ID ?? "";

  return (
    <>
      <Header />
      <main>
        <Hero />
        <Services projectTypes={projectTypes} />
        <HowItWorks />
        <Features />
        <ContactSection projectTypes={projectTypes} businessId={businessId} />
      </main>
      <Footer />
    </>
  );
}
