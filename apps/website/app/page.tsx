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

export default async function Home() {
  const projectTypes = await getProjectTypes();
  const businessId = process.env.NEXT_PUBLIC_BUSINESS_ID ?? "";

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold sm:text-3xl">Contact Us</h1>
        <p className="mt-2 text-sm text-gray-600">
          Leave your details and our team will call you back about your
          real-estate enquiry.
        </p>
      </header>

      <ContactForm projectTypes={projectTypes} businessId={businessId} />
    </main>
  );
}
