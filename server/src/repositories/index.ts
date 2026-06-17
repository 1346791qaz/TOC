import {
  ENTITIES,
  type Assumption,
  type Constraint,
  type DataElement,
  type Engagement,
  type EntityKey,
  type FlowEdge,
  type Metric,
  type Persona,
  type ProcessStep,
  type StepPersona,
  type ValueStream,
} from "@shared/schemas";
import { Repository } from "./repository";

// Precise per-entity repository types so callers get full record shapes back.
export interface RepoMap {
  engagements: Repository<Engagement>;
  value_streams: Repository<ValueStream>;
  assumptions: Repository<Assumption>;
  metrics: Repository<Metric>;
  personas: Repository<Persona>;
  process_steps: Repository<ProcessStep>;
  step_personas: Repository<StepPersona>;
  data_elements: Repository<DataElement>;
  constraints: Repository<Constraint>;
  flow_edges: Repository<FlowEdge>;
}

// One repository instance per entity, keyed by its API/table name.
export const repos = Object.fromEntries(
  (Object.keys(ENTITIES) as EntityKey[]).map((key) => [
    key,
    new Repository(ENTITIES[key].table, ENTITIES[key].schema),
  ]),
) as unknown as RepoMap;

export function repoFor(key: EntityKey): Repository<{ id: string }> {
  return repos[key] as unknown as Repository<{ id: string }>;
}
