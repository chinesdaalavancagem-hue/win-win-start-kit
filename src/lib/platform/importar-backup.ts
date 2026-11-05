import { parseBancas, type BancasDoc } from "./bancas";

/** Lê CSV com ";" ou "," (aspas duplas com "" de escape, campos multilinha). */
function lerCsv(texto: string): string[][] {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? "";
  const sep = primeira.includes(";") ? ";" : ",";
  const linhas: string[][] = [];
  let linha: string[] = [], campo = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

/** Extrai o documento de bancas de um backup (JSON da plataforma ou CSV exportado da tabela). */
export function extrairDocumentoBackup(texto: string): BancasDoc | null {
  const t = texto.replace(/^\uFEFF/, "").trim();
  const candidatos: string[] = [];
  if (t.startsWith("{")) candidatos.push(t);
  else {
    const linhas = lerCsv(t);
    const col = (linhas[0] ?? []).findIndex((h) => h.trim().toLowerCase() === "data");
    if (col < 0) return null;
    for (const l of linhas.slice(1)) if (l[col]?.trim().startsWith("{")) candidatos.push(l[col]);
  }
  let melhor: BancasDoc | null = null;
  for (const c of candidatos) {
    try {
      const p = JSON.parse(c);
      if (!p || !Array.isArray(p.bancas) || !p.bancas.length) continue;
      const doc = parseBancas(c);
      if (!melhor || doc.bancas.length > melhor.bancas.length) melhor = doc;
    } catch { /* linha inválida: ignora */ }
  }
  return melhor;
}

/** Junta as bancas do backup às atuais sem alterar nem remover nenhuma banca existente. */
export function mesclarBackup(atual: BancasDoc, backup: BancasDoc): { doc: BancasDoc; adicionadas: number; ignoradas: number } {
  const ids = new Set(atual.bancas.map((b) => b.id));
  const novas = backup.bancas.filter((b) => !ids.has(b.id));
  const idsMesas = new Set((atual.mesasPersonalizadas ?? []).map((m) => m.id));
  const mesasNovas = (backup.mesasPersonalizadas ?? []).filter((m) => !idsMesas.has(m.id));
  return {
    doc: { ...atual, bancas: [...atual.bancas, ...novas], mesasPersonalizadas: [...(atual.mesasPersonalizadas ?? []), ...mesasNovas] },
    adicionadas: novas.length,
    ignoradas: backup.bancas.length - novas.length,
  };
}
