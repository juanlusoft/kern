import type {
  PresenceCurrentParams,
  PresenceCurrentResult,
  PresenceEmployeeFindParams,
  PresenceEmployeeFindResult,
  PresencePunchesListParams,
  PresencePunchesListResult,
  PresenceReadPort
} from '../../contracts/src/index';

export type {
  PresenceCurrentParams,
  PresenceCurrentResult,
  PresenceEmployeeFindParams,
  PresenceEmployeeFindResult,
  PresencePunchesListParams,
  PresencePunchesListResult,
  PresenceReadPort
} from '../../contracts/src/index';

export interface CorePresenceReadPort extends PresenceReadPort {}

export function asCorePresenceReadPort(port: PresenceReadPort): CorePresenceReadPort {
  return port;
}
