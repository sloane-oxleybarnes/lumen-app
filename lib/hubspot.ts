const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const BASE_URL = "https://api.hubspot.com";

interface HubSpotContact {
  email: string;
  firstname?: string;
  lastname?: string;
  plan?: string;
  source?: string;
  extension_installed?: boolean;
}

export async function createOrUpdateHubSpotContact(
  contact: HubSpotContact
): Promise<string | null> {
  if (!HUBSPOT_API_KEY) return null;

  try {
    const res = await fetch(`${BASE_URL}/crm/v3/contacts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
      },
      body: JSON.stringify({
        properties: {
          email: contact.email,
          firstname: contact.firstname || "",
          lastname: contact.lastname || "",
          lumen_plan: contact.plan || "free",
          lumen_source: contact.source || "website",
          lumen_extension_installed: contact.extension_installed || false,
        },
      }),
    });

    if (res.status === 409) {
      const existing = await res.json();
      const id = existing.message?.match(/ID: (\d+)/)?.[1];
      if (id) {
        await fetch(`${BASE_URL}/crm/v3/contacts/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${HUBSPOT_API_KEY}`,
          },
          body: JSON.stringify({
            properties: {
              lumen_plan: contact.plan || "free",
              lumen_source: contact.source || "website",
              lumen_extension_installed: contact.extension_installed ?? false,
            },
          }),
        });
        return id;
      }
    }

    const data = await res.json();
    return data.id || null;
  } catch (err) {
    console.error("HubSpot error:", err);
    return null;
  }
}

export async function createHubSpotDeal(params: {
  contactId: string;
  dealName: string;
  amount: number;
  stage: string;
  plan: string;
}): Promise<string | null> {
  if (!HUBSPOT_API_KEY) return null;

  try {
    const res = await fetch(`${BASE_URL}/crm/v3/deals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
      },
      body: JSON.stringify({
        properties: {
          dealname: params.dealName,
          amount: params.amount,
          dealstage: params.stage,
          pipeline: "default",
          lumen_plan: params.plan,
        },
        associations: [
          {
            to: { id: params.contactId },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: 3,
              },
            ],
          },
        ],
      }),
    });
    const data = await res.json();
    return data.id || null;
  } catch (err) {
    console.error("HubSpot deal error:", err);
    return null;
  }
}

export async function createHubSpotCompany(params: {
  name: string;
  contactId: string;
  plan: string;
}): Promise<string | null> {
  if (!HUBSPOT_API_KEY) return null;

  try {
    const res = await fetch(`${BASE_URL}/crm/v3/companies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
      },
      body: JSON.stringify({
        properties: {
          name: params.name,
          lumen_plan: params.plan,
        },
        associations: [
          {
            to: { id: params.contactId },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: 1,
              },
            ],
          },
        ],
      }),
    });
    const data = await res.json();
    return data.id || null;
  } catch (err) {
    console.error("HubSpot company error:", err);
    return null;
  }
}
