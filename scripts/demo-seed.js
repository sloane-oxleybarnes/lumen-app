#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_CORPUS_PATH = path.join(__dirname, "..", "demo", "corpus", "beckett-demo-corpus.json");
const GMAIL_BASE_URL = "https://gmail.googleapis.com/gmail/v1";
const SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage";

const args = new Set(process.argv.slice(2));
const options = {
  plan: args.has("--plan"),
  dryRun: args.has("--dry-run"),
  gmail: args.has("--gmail"),
  slack: args.has("--slack"),
  contacts: args.has("--contacts"),
};

if (args.has("--all")) {
  options.gmail = true;
  options.slack = true;
  options.contacts = true;
}

if (!options.plan && !options.gmail && !options.slack && !options.contacts) {
  options.plan = true;
}

const corpusPath = process.env.DEMO_CORPUS || DEFAULT_CORPUS_PATH;
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
const seedBaseTime = process.env.DEMO_BASE_TIME ? new Date(process.env.DEMO_BASE_TIME) : new Date();
const personById = new Map([
  [corpus.demoAccount.id, corpus.demoAccount],
  ...corpus.personas.map((person) => [person.id, person]),
]);

function usage() {
  console.log("Usage: node scripts/demo-seed.js [--plan] [--gmail] [--slack] [--contacts] [--all] [--dry-run]");
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalJsonEnv(name, fallback = {}) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Could not parse ${name} as JSON: ${error.message}`);
  }
}

function optionalEnvForDryRun(name, fallback) {
  if (options.dryRun) {
    return process.env[name] || fallback;
  }

  return requireEnv(name);
}

function dateFromMinutesAgo(minutesAgo) {
  return new Date(seedBaseTime.getTime() - minutesAgo * 60 * 1000);
}

function formatAddress(person) {
  return `"${person.name.replace(/"/g, '\\"')}" <${person.email}>`;
}

function getPerson(id) {
  const person = personById.get(id);
  if (!person) {
    throw new Error(`Unknown corpus person id: ${id}`);
  }
  return person;
}

function base64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSlackHandle(value) {
  return String(value || "").trim().replace(/^@/, "").toLowerCase();
}

function messageIdFor(thread, index) {
  return `${thread.id}.${index + 1}.${corpus.version}@beckett-demo.local`;
}

function buildMimeMessage(thread, message, index) {
  const from = getPerson(message.from);
  const to = message.to.map((id) => getPerson(id));
  const previousMessageIds = Array.from({ length: index }, (_, previousIndex) => `<${messageIdFor(thread, previousIndex)}>`);
  const headers = [
    `From: ${formatAddress(from)}`,
    `To: ${to.map(formatAddress).join(", ")}`,
    `Subject: ${thread.subject}`,
    `Date: ${dateFromMinutesAgo(message.minutesAgo).toUTCString()}`,
    `Message-ID: <${messageIdFor(thread, index)}>`,
  ];

  if (index > 0) {
    headers.push(`In-Reply-To: <${messageIdFor(thread, 0)}>`);
    headers.push(`References: ${previousMessageIds.join(" ")}`);
  }

  headers.push("MIME-Version: 1.0");
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push("Content-Transfer-Encoding: 7bit");
  headers.push("");
  headers.push(message.body);

  return headers.join("\r\n");
}

async function requestJson(url, optionsForRequest) {
  const response = await fetch(url, optionsForRequest);
  const text = await response.text();
  let json = null;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      json = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(`${optionsForRequest.method || "GET"} ${url} failed (${response.status}): ${text}`);
  }

  return json;
}

async function seedGmail() {
  const accessToken = optionalEnvForDryRun("DEMO_GMAIL_ACCESS_TOKEN", "dry-run-token");
  const userId = encodeURIComponent(process.env.DEMO_GMAIL_USER || "me");
  let count = 0;

  for (const thread of corpus.emailThreads) {
    for (const [index, message] of thread.messages.entries()) {
      const raw = base64Url(buildMimeMessage(thread, message, index));
      const fromDemo = message.from === corpus.demoAccount.id;
      const labelIds = fromDemo ? ["SENT"] : ["INBOX", "UNREAD"];
      const url = `${GMAIL_BASE_URL}/users/${userId}/messages?internalDateSource=dateHeader`;
      const payload = { raw, labelIds };

      count += 1;
      if (options.dryRun) {
        console.log(`[dry-run:gmail] insert ${thread.id} message ${index + 1} labels=${labelIds.join(",")}`);
        continue;
      }

      await requestJson(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      console.log(`[gmail] inserted ${thread.id} message ${index + 1}`);
    }
  }

  console.log(`${options.dryRun ? "[dry-run:gmail]" : "[gmail]"} ${count} messages processed`);
}

async function postSlackMessage(token, payload) {
  const json = await requestJson(SLACK_POST_MESSAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!json.ok) {
    throw new Error(`Slack chat.postMessage failed: ${json.error || "unknown_error"}`);
  }

  return json;
}

function slackPayloadForMessage(channel, message, persona, optionsForMessage) {
  const shouldCustomize = optionsForMessage.useCustomize && !optionsForMessage.hasPersonaToken;
  const shouldPrefix = !optionsForMessage.hasPersonaToken && !shouldCustomize;
  const payload = {
    channel,
    text: shouldPrefix ? `*${persona.name}:* ${message.text}` : message.text,
    unfurl_links: false,
    unfurl_media: false,
  };

  if (shouldCustomize) {
    payload.username = persona.name;
    payload.icon_emoji = ":speech_balloon:";
    payload.text = message.text;
  }

  return payload;
}

async function seedSlack() {
  const botToken = optionalEnvForDryRun("DEMO_SLACK_BOT_TOKEN", "dry-run-token");
  const channelMap = options.dryRun
    ? optionalJsonEnv("DEMO_SLACK_CHANNEL_MAP_JSON", Object.fromEntries(corpus.slackConversations.map((item) => [item.channelKey, `dry-run-${item.channelKey}`])))
    : optionalJsonEnv("DEMO_SLACK_CHANNEL_MAP_JSON");
  const personaTokens = optionalJsonEnv("DEMO_SLACK_PERSONA_TOKENS_JSON");
  const delayMs = Number(process.env.DEMO_SLACK_DELAY_MS || "1200");
  const useCustomize = process.env.DEMO_SLACK_USE_CUSTOMIZE === "true";
  let count = 0;

  for (const conversation of corpus.slackConversations) {
    const channel = channelMap[conversation.channelKey];
    if (!channel) {
      throw new Error(`Missing channel mapping for ${conversation.channelKey} in DEMO_SLACK_CHANNEL_MAP_JSON`);
    }

    for (const message of conversation.messages) {
      const persona = getPerson(message.persona);
      const hasPersonaToken = Boolean(personaTokens[message.persona]);
      const token = personaTokens[message.persona] || botToken;
      const payload = slackPayloadForMessage(channel, message, persona, { useCustomize, hasPersonaToken });
      count += 1;

      if (options.dryRun) {
        console.log(`[dry-run:slack] post ${conversation.label} as ${persona.name}: ${message.text}`);
      } else {
        await postSlackMessage(token, payload);
        console.log(`[slack] posted ${conversation.label} as ${persona.name}`);
      }

      if (!options.dryRun && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  console.log(`${options.dryRun ? "[dry-run:slack]" : "[slack]"} ${count} messages processed`);
}

function supabaseHeaders(serviceRoleKey, prefer) {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  return headers;
}

function supabaseUrl(baseUrl, pathPart, params = {}) {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/rest/v1/${pathPart}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function findContact(baseUrl, serviceRoleKey, userId, person) {
  const url = supabaseUrl(baseUrl, "contacts", {
    select: "id",
    user_id: `eq.${userId}`,
    name: `eq.${person.name}`,
    limit: "1",
  });
  const rows = await requestJson(url, {
    method: "GET",
    headers: supabaseHeaders(serviceRoleKey),
  });
  return rows[0] || null;
}

async function upsertContact(baseUrl, serviceRoleKey, userId, person) {
  const payload = {
    user_id: userId,
    name: person.name,
    email: normalizeEmail(person.email),
    slack_handle: normalizeSlackHandle(person.slackHandle),
    phone_number: normalizePhone(person.phone),
    relationship_type: person.relationshipType,
    notes: person.notes,
    trusted: Boolean(person.trusted),
  };

  if (options.dryRun) {
    console.log(`[dry-run:contacts] upsert contact ${person.name}`);
    return { id: `dry-run-${person.id}` };
  }

  const existing = await findContact(baseUrl, serviceRoleKey, userId, person);

  if (existing) {
    const rows = await requestJson(supabaseUrl(baseUrl, "contacts", { id: `eq.${existing.id}`, select: "id" }), {
      method: "PATCH",
      headers: supabaseHeaders(serviceRoleKey, "return=representation"),
      body: JSON.stringify(payload),
    });
    return rows[0];
  }

  const rows = await requestJson(supabaseUrl(baseUrl, "contacts", { select: "id" }), {
    method: "POST",
    headers: supabaseHeaders(serviceRoleKey, "return=representation"),
    body: JSON.stringify(payload),
  });
  return rows[0];
}

function identifiersForPerson(userId, contactId, person, slackTeamId, slackUserIds) {
  const identifiers = [
    {
      user_id: userId,
      contact_id: contactId,
      platform: "email",
      identifier: normalizeEmail(person.email),
      label: "Primary email",
      confirmed: true,
    },
    {
      user_id: userId,
      contact_id: contactId,
      platform: "work_email",
      identifier: normalizeEmail(person.workEmail || person.email),
      label: "Work email",
      confirmed: true,
    },
    {
      user_id: userId,
      contact_id: contactId,
      platform: "slack",
      identifier: normalizeSlackHandle(person.slackHandle),
      label: "Slack display handle",
      confirmed: false,
    },
    {
      user_id: userId,
      contact_id: contactId,
      platform: "phone",
      identifier: normalizePhone(person.phone),
      label: "Phone",
      confirmed: true,
    },
  ].filter((identifier) => identifier.identifier);

  const slackUserId = slackUserIds[person.id];
  if (slackTeamId && slackUserId) {
    identifiers.push({
      user_id: userId,
      contact_id: contactId,
      platform: "slack_user_id",
      identifier: `${slackTeamId}:${slackUserId}`,
      label: "Confirmed Slack user",
      confirmed: true,
    });
  }

  return identifiers;
}

async function upsertIdentifiers(baseUrl, serviceRoleKey, identifiers) {
  if (!identifiers.length) {
    return;
  }

  if (options.dryRun) {
    for (const identifier of identifiers) {
      const state = identifier.confirmed ? "confirmed" : "fallback";
      console.log(`[dry-run:contacts] ${identifier.platform}:${identifier.identifier} (${state})`);
    }
    return;
  }

  await requestJson(supabaseUrl(baseUrl, "contact_identifiers", { on_conflict: "user_id,platform,identifier" }), {
    method: "POST",
    headers: supabaseHeaders(serviceRoleKey, "resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify(identifiers),
  });
}

async function upsertRelationshipSummary(baseUrl, serviceRoleKey, userId, contactId, person) {
  const summary = person.relationshipSummary;
  if (!summary) {
    return;
  }

  const payload = {
    user_id: userId,
    contact_id: contactId,
    communication_style: summary.communicationStyle,
    recurring_tension_points: summary.recurringTensionPoints,
    what_tends_to_work: summary.whatTendsToWork,
    unresolved_topics: summary.unresolvedTopics,
    generated_from: summary.generatedFrom,
    updated_at: new Date().toISOString(),
  };

  if (options.dryRun) {
    console.log(`[dry-run:contacts] upsert relationship summary for ${person.name}`);
    return;
  }

  await requestJson(supabaseUrl(baseUrl, "contact_relationship_summaries", { on_conflict: "user_id,contact_id" }), {
    method: "POST",
    headers: supabaseHeaders(serviceRoleKey, "resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify(payload),
  });
}

async function insertInteractionSummaries(baseUrl, serviceRoleKey, userId, contactByPersonaId) {
  const rows = corpus.interactionSummaries
    .map((summary) => {
      const contact = contactByPersonaId.get(summary.persona);
      if (!contact) {
        return null;
      }

      return {
        user_id: userId,
        contact_id: contact.id,
        platform: summary.platform,
        interaction_type: summary.interactionType,
        summary: summary.summary,
        tone_observed: summary.toneObserved,
        user_response_pattern: summary.userResponsePattern,
        suggested_followup: summary.suggestedFollowup,
        occurred_at: new Date().toISOString(),
        metadata: {
          source: "demo_seed",
          corpus_version: corpus.version,
        },
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    return;
  }

  if (options.dryRun) {
    console.log(`[dry-run:contacts] insert ${rows.length} interaction summaries`);
    return;
  }

  await requestJson(supabaseUrl(baseUrl, "interaction_summaries"), {
    method: "POST",
    headers: supabaseHeaders(serviceRoleKey, "return=minimal"),
    body: JSON.stringify(rows),
  });
}

async function seedContacts() {
  const baseUrl = optionalEnvForDryRun("DEMO_SUPABASE_URL", "https://example.supabase.co");
  const serviceRoleKey = optionalEnvForDryRun("DEMO_SUPABASE_SERVICE_ROLE_KEY", "dry-run-service-role-key");
  const userId = optionalEnvForDryRun("DEMO_BECKETT_USER_ID", "00000000-0000-0000-0000-000000000000");
  const slackTeamId = process.env.DEMO_SLACK_TEAM_ID || "";
  const slackUserIds = optionalJsonEnv("DEMO_SLACK_USER_ID_MAP_JSON");
  const contactByPersonaId = new Map();

  for (const person of corpus.personas) {
    const contact = await upsertContact(baseUrl, serviceRoleKey, userId, person);
    contactByPersonaId.set(person.id, contact);
    await upsertIdentifiers(baseUrl, serviceRoleKey, identifiersForPerson(userId, contact.id, person, slackTeamId, slackUserIds));
    await upsertRelationshipSummary(baseUrl, serviceRoleKey, userId, contact.id, person);
    console.log(`${options.dryRun ? "[dry-run:contacts]" : "[contacts]"} seeded ${person.name}`);
  }

  await insertInteractionSummaries(baseUrl, serviceRoleKey, userId, contactByPersonaId);
  console.log(`${options.dryRun ? "[dry-run:contacts]" : "[contacts]"} ${corpus.personas.length} contacts processed`);
}

function printPlan() {
  const emailMessageCount = corpus.emailThreads.reduce((sum, thread) => sum + thread.messages.length, 0);
  const slackMessageCount = corpus.slackConversations.reduce((sum, conversation) => sum + conversation.messages.length, 0);

  usage();
  console.log("");
  console.log(`Corpus: ${corpus.title} (${corpus.version})`);
  console.log(`Demo account: ${corpus.demoAccount.name} <${corpus.demoAccount.email}>`);
  console.log(`Personas: ${corpus.personas.length}`);
  console.log(`Email threads: ${corpus.emailThreads.length}, messages: ${emailMessageCount}`);
  console.log(`Slack conversations: ${corpus.slackConversations.length}, messages: ${slackMessageCount}`);
  console.log(`Interaction summaries: ${corpus.interactionSummaries.length}`);
  console.log("");
  console.log("Recommended order:");
  console.log("1. Apply the Phase 4 migration to the target Beckett Supabase project.");
  console.log("2. Create demo Gmail and Slack accounts/workspace.");
  console.log("3. Export the env values from demo/.env.example.");
  console.log("4. Run npm run demo:seed:contacts, then Gmail/Slack seeders.");
  console.log("");
  console.log("Slack note: confirmed Beckett linking needs DEMO_SLACK_TEAM_ID plus real Slack user IDs.");
}

async function main() {
  if (options.plan) {
    printPlan();
  }

  if (options.contacts) {
    await seedContacts();
  }

  if (options.gmail) {
    await seedGmail();
  }

  if (options.slack) {
    await seedSlack();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
