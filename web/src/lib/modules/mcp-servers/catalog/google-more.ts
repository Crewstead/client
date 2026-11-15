import {
  siGmail,
  siGooglebigquery,
  siGooglecalendar,
  siGoogledrive,
  siGooglemaps,
  siMake,
  siZapier,
} from 'simple-icons';
import { oauth, own, google, type CatalogEntry } from './entries.ts';

/** Google, Automation. */
export const googleMore: CatalogEntry[] = [
  google('gmail', 'Gmail', 'Read mail, draft and label', 'gmailmcp', siGmail),
  google('google_drive', 'Google Drive', 'Files in Drive', 'drivemcp', siGoogledrive),
  google(
    'google_calendar',
    'Google Calendar',
    'Calendars and events',
    'calendarmcp',
    siGooglecalendar,
  ),
  {
    id: 'google_maps',
    name: 'Google Maps',
    category: 'Google',
    description: 'Places, routes and weather',
    url: 'https://mapstools.googleapis.com/mcp',
    auth: { kind: 'key', header: 'X-Goog-Api-Key', prefix: '', label: 'API key' },
    docs: 'https://developers.google.com/maps/ai/grounding-lite',
    icon: siGooglemaps,
  },
  {
    id: 'bigquery',
    name: 'BigQuery',
    category: 'Google',
    description: 'Query and inspect datasets',
    url: 'https://bigquery.googleapis.com/mcp',
    auth: own,
    docs: 'https://docs.cloud.google.com/bigquery/docs/use-bigquery-mcp',
    icon: siGooglebigquery,
  },
  {
    id: 'zapier',
    name: 'Zapier',
    category: 'Automation',
    description: 'Actions in thousands of apps',
    url: 'https://mcp.zapier.com/api/mcp/mcp',
    auth: oauth,
    docs: 'https://docs.zapier.com/mcp/home',
    icon: siZapier,
  },
  {
    id: 'make',
    name: 'Make',
    category: 'Automation',
    description: 'Run and manage scenarios',
    url: 'https://mcp.make.com/v2',
    auth: oauth,
    docs: 'https://developers.make.com/mcp-server/make-mcp-server',
    icon: siMake,
  },
];
