// AI-assisted: written with Claude Code from the team's build spec.
// Checks the Twilio setup end to end before the demo: credentials, the
// sending number, and one real test text and call to the numbers in
// .env.local. Run: npm run twilio:check -- +16035551234
import "./_env";
import { sayTwiml } from "../src/lib/messages";
import { normalizePhone, placeCall, publicBaseUrl, sendSms, transportMode } from "../src/lib/twilio";

const to = process.argv[2] ? normalizePhone(process.argv[2]) : null;
const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;

function fail(msg: string): never {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
}

if (transportMode() !== "twilio") fail("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are not all set in .env.local (or TWILIO_DRY_RUN=1).");
if (!from || !normalizePhone(from)) fail(`TWILIO_FROM is not an E.164 number: ${from}`);
console.log(`OK    credentials present, sending from ${from}`);

const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
const acct = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, { headers: { Authorization: auth } });
if (!acct.ok) fail(`Twilio rejected the credentials (HTTP ${acct.status}).`);
const a = (await acct.json()) as { friendly_name: string; status: string; type: string };
console.log(`OK    account "${a.friendly_name}" is ${a.status} (${a.type})`);
if (a.type === "Trial") console.log("NOTE  trial account: Twilio only delivers to verified numbers and prefixes every text with a trial notice.");

const nums = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(from!)}`, { headers: { Authorization: auth } });
const owned = ((await nums.json()) as { incoming_phone_numbers?: { sms_url?: string; voice_url?: string }[] }).incoming_phone_numbers ?? [];
if (owned.length === 0) fail(`${from} is not a number on this account.`);
const base = publicBaseUrl();
const want = base ? `${base}/api/twilio/inbound` : null;
if (!base) console.log("WARN  PUBLIC_BASE_URL is not set: replies and key presses cannot reach this app.");
else if (owned[0].sms_url !== want) console.log(`WARN  the number's incoming-message webhook is "${owned[0].sms_url || "(none)"}", expected ${want}`);
else console.log("OK    incoming-message webhook points at this app");
console.log("NOTE  US texting from a local number needs A2P 10DLC registration, or a toll-free number needs verification; unregistered sends are blocked or filtered by carriers.");

if (!to) {
  console.log("DONE  pass a phone number to send a test text and call:  npm run twilio:check -- +16035551234");
  process.exit(0);
}
try {
  const sms = await sendSms(to, "Pilot Light test: texting works. Reply OK to test the reply path. Call 911 for any emergency.");
  console.log(`OK    text sent to ${to} (${sms})`);
  const call = await placeCall(to, sayTwiml("This is Pilot Light. Calling works. Goodbye."));
  console.log(`OK    call placed to ${to} (${call})`);
  console.log("DONE  if the phone got both, run the replay. Reply OK to the text to confirm the inbound path.");
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
