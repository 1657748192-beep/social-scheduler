import {getBaseline,type RuleSnapshot} from '@social-scheduler/timezone-rules';
// Availability follows the validated data snapshot, never the browser's embedded offsets.
export function checkTimeZoneRules(zoneId:string,rules:RuleSnapshot=getBaseline()):{supported:boolean;reason?:string}{
 return rules.canonicalZone(zoneId)?{supported:true}:{supported:false,reason:'zone-unavailable'};
}
