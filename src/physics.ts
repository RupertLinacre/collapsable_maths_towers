import { RAPIER, createRapierPhysics } from '@phaserjs/rapier-connector';

export { RAPIER, createRapierPhysics };
export type RapierPhysics = ReturnType<typeof createRapierPhysics>;
export type RapierBody = ReturnType<RapierPhysics['addRigidBody']>;