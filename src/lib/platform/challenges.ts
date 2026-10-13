import { type Banca, novaBanca } from "./bancas";
import { ASSETS, freshAttempt, freshBonus, type State } from "./engine";
import { challengeAccountSchema, type ChallengeAccount } from "../prop-firms";

export function needsNewChallenge(state: State): boolean {
  return state.log.at(-1)?.tipo === "reprovada";
}

/** Retains the trading plan, never the closed account's balances or history. */
export function createChallengeBanca(source: Banca, account: ChallengeAccount, firmName: string): Banca {
  const validated = challengeAccountSchema.parse(account);
  const state = structuredClone(source.state);
  state.log = [];
  state.counts = { aprovadas: 0, reprovadas: 0 };
  state.cfdBalance = 0;
  state.totalGasto = 0;
  if (state.activeTab === "historico") state.activeTab = "nasdaq";
  for (const asset of ASSETS) {
    state.assets[asset].attempt = freshAttempt();
    state.assets[asset].bonus = freshBonus();
    state.assets[asset].params.saldoInicial = 0;
  }
  return { ...novaBanca(`${firmName} · ${validated.account_external_id}`, state), challengeAccount: validated };
}