/**
 * The name a person knows a site by: accounts.google.com is "Google", not
 * "google.com". Names with their own spelling are listed; anything else takes
 * the page's own spelling when that spells the same word as the domain (so a
 * page can fix "Paypal" into "PayPal", but can never call itself something
 * else), and otherwise the domain's label with a capital.
 */
import { isIpHost } from "./psl";
import { brandLabel, isLoopback, type SiteInfo } from "./site";

const KNOWN: Record<string, string> = {
  x: "X", twitter: "X", google: "Google", gmail: "Gmail", youtube: "YouTube", github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket", paypal: "PayPal",
  linkedin: "LinkedIn", tiktok: "TikTok", whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", fb: "Facebook", messenger: "Messenger", threads: "Threads",
  snapchat: "Snapchat", pinterest: "Pinterest", reddit: "Reddit", telegram: "Telegram", discord: "Discord", twitch: "Twitch", openai: "OpenAI", chatgpt: "ChatGPT",
  anthropic: "Anthropic", claude: "Claude", huggingface: "Hugging Face", openrouter: "OpenRouter", icloud: "iCloud", apple: "Apple", ebay: "eBay",
  live: "Microsoft", microsoft: "Microsoft", microsoftonline: "Microsoft", office: "Microsoft 365", office365: "Microsoft 365", outlook: "Outlook", hotmail: "Outlook",
  xbox: "Xbox", playstation: "PlayStation", steampowered: "Steam", steamcommunity: "Steam", epicgames: "Epic Games", riotgames: "Riot Games", ea: "EA", battle: "Battle.net",
  amazon: "Amazon", amazonaws: "AWS", aliexpress: "AliExpress", netflix: "Netflix", spotify: "Spotify", soundcloud: "SoundCloud", disneyplus: "Disney+", primevideo: "Prime Video",
  hbomax: "HBO Max", imdb: "IMDb", stackoverflow: "Stack Overflow", stackexchange: "Stack Exchange", wordpress: "WordPress", digitalocean: "DigitalOcean",
  cloudflare: "Cloudflare", godaddy: "GoDaddy", hubspot: "HubSpot", sendgrid: "SendGrid", npmjs: "npm", leetcode: "LeetCode", codepen: "CodePen", booking: "Booking.com",
  airbnb: "Airbnb", doordash: "DoorDash", ikea: "IKEA", bbc: "BBC", cnn: "CNN", nytimes: "The New York Times", wsj: "The Wall Street Journal", ibm: "IBM", hp: "HP", amd: "AMD", nvidia: "NVIDIA",
  lg: "LG", att: "AT&T", hsbc: "HSBC", bankofamerica: "Bank of America", wellsfargo: "Wells Fargo", chase: "Chase", capitalone: "Capital One", americanexpress: "American Express",
  vk: "VK", qq: "QQ", wechat: "WeChat", line: "LINE", duckduckgo: "DuckDuckGo", protonmail: "Proton", proton: "Proton", mailchimp: "Mailchimp", zoho: "Zoho",
};

const squash = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export function siteName(site: SiteInfo, pageNames: string[] = []): string {
  if (isIpHost(site.host) || isLoopback(site.host)) return site.host;
  const label = brandLabel(site);
  const known = KNOWN[label];
  if (known) return known;
  if (label.startsWith("xn--")) return site.site; // the readable form needs a converter we do not ship
  const page = pageNames.map((n) => n.trim()).find((n) => n.length <= 40 && squash(n) === squash(label));
  return page ?? label.split(/[-_]+/).filter(Boolean).map(capital).join(" ");
}
