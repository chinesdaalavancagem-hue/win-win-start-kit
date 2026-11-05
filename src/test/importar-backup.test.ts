import { describe, expect, it } from "vitest";
import { novaBanca, parseBancas } from "@/lib/platform/bancas";
import { extrairDocumentoBackup, mesclarBackup } from "@/lib/platform/importar-backup";

function doc(nomes: string[]) {
  const bancas = nomes.map((n) => novaBanca(n));
  return parseBancas(JSON.stringify({ bancasVersion: 1, activeId: bancas[0]!.id, bancas }));
}

describe("importar backup", () => {
  it("mantém todas as bancas atuais e adiciona as antigas", () => {
    const atual = doc(["Nova A", "Nova B"]);
    const antigo = doc(["Antiga 1", "Antiga 2", "Antiga 3"]);
    const r = mesclarBackup(atual, antigo);
    expect(r.doc.bancas.map((b) => b.nome)).toEqual(["Nova A", "Nova B", "Antiga 1", "Antiga 2", "Antiga 3"]);
    expect(r.doc.activeId).toBe(atual.activeId);
    expect(r.adicionadas).toBe(3);
  });

  it("não duplica ao importar o mesmo backup duas vezes", () => {
    const antigo = doc(["Antiga 1"]);
    const uma = mesclarBackup(doc(["Nova"]), antigo).doc;
    const r = mesclarBackup(uma, antigo);
    expect(r.doc.bancas).toHaveLength(2);
    expect(r.adicionadas).toBe(0);
  });

  it("lê o CSV exportado e escolhe a linha com mais bancas", () => {
    const pequena = JSON.stringify(doc(["Teste"]));
    const grande = JSON.stringify(doc(["Conta 1", "Conta 2"]));
    const q = (s: string) => '"' + s.replace(/"/g, '""') + '"';
    const csv = `user_id;data;updated_at;version\nu1;${q(pequena)};2026;1\nu2;${q(grande)};2026;5\n`;
    expect(extrairDocumentoBackup(csv)?.bancas.map((b) => b.nome)).toEqual(["Conta 1", "Conta 2"]);
  });
});
