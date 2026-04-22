import { NextRequest, NextResponse } from 'next/server';
import { validateStructure } from '@/lib/agents/structure-validator';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const entries = formData.getAll('file').concat(formData.getAll('files'));

  if (entries.length === 0 || !(entries[0] instanceof Blob)) {
    return NextResponse.json({ error: 'Fichier XML requis' }, { status: 400 });
  }

  if (entries.length === 1) {
    const content = await (entries[0] as Blob).text();
    return NextResponse.json(validateStructure(content));
  }

  // Multiple files — validate all and merge errors
  const allErrors: Array<{ file: string; dimension: number; message: string; path?: string }> = [];
  for (const entry of entries) {
    if (!(entry instanceof Blob)) continue;
    const name = entry instanceof File ? entry.name : 'inconnu.xml';
    const content = await entry.text();
    const result = validateStructure(content);
    for (const e of result.errors) {
      allErrors.push({ file: name, ...e });
    }
  }
  return NextResponse.json({ valid: allErrors.length === 0, errors: allErrors });
}
