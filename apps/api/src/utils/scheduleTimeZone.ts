import {z} from 'zod';
import {knownRuleZone} from '../timezoneRules/runtime';

export const scheduleTimeZoneSchema = z.string().min(1).max(80).refine(value => {
  // Accept explicit UTC or geographical IANA identifiers (including valid historical aliases), not CST/UTC+8.
  if (value !== 'UTC' && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(value)) return false;
  if(knownRuleZone(value))return true;
  try { new Intl.DateTimeFormat('en', {timeZone:value}).format(0); return true; } catch { return false; }
}, 'Choose a supported IANA time zone or UTC');
