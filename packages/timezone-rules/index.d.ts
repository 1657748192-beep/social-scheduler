export type TimeCandidate={instant:string;offsetMinutes:number};
export type TimeResolution={kind:'empty'}|{kind:'invalid';reason:'date'|'zone'|'gap'|'unsupported'}|{kind:'ambiguous';candidates:TimeCandidate[]}|{kind:'resolved';candidate:TimeCandidate};
export type CalendarParts={year:number;month:number;day:number;hour:number;minute:number;second:number;millisecond:number};
export type RuleBundle={schemaVersion:1;engineCompatibility:1;tzdbVersion:string;source:string;generatedAt:string;sha256:string;sourceBytes:string;data:{version:string;zones:string[];links:string[]}};
export interface RuleSnapshot{readonly version:string;readonly digest:string;canonicalZone(id:string):string|null;offsetAt(id:string,epochMs:number):number;localParts(id:string,epochMs:number):CalendarParts;resolve(id:string,localValue:string):TimeResolution}
export class InvalidRulesError extends Error{}
export const baselineBundle:RuleBundle;
export function validateBundle(input:unknown):RuleBundle;
export function createRuleSnapshot(bundle:RuleBundle):RuleSnapshot;
export function getBaseline():RuleSnapshot;
export function compareVersions(a:string,b:string):number;
