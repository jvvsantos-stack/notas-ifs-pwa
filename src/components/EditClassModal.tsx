import { useState } from 'react';
import Modal from './Modal';
import { supabase } from '../utils/supabaseClient';
import type { ClassRow } from '../types/database';

interface EditClassModalProps {
  classData: ClassRow;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditClassModal({ classData, onClose, onSaved }: EditClassModalProps) {
  const [nome, setNome] = useState(classData.nome_disciplina);
  const [pesoProva, setPesoProva] = useState(classData.peso_prova);
  const [pesoLab, setPesoLab] = useState(classData.peso_lab);
  const [qtdTrPorEtapa, setQtdTrPorEtapa] = useState<number[]>([...classData.qtd_tr_por_etapa]);
  const [qtdPraticasPorEtapa, setQtdPraticasPorEtapa] = useState<number[]>([
    ...classData.qtd_praticas_por_etapa,
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trReduzido = qtdTrPorEtapa.some((qtd, i) => qtd < (classData.qtd_tr_por_etapa[i] ?? 0));
  const praticasReduzidas = qtdPraticasPorEtapa.some(
    (qtd, i) => qtd < (classData.qtd_praticas_por_etapa[i] ?? 0)
  );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { error: updateErr } = await supabase
        .from('classes')
        .update({
          nome_disciplina: nome,
          peso_prova: Number(pesoProva.toFixed(1)),
          peso_lab: Number(pesoLab.toFixed(1)),
          qtd_tr_por_etapa: qtdTrPorEtapa,
          qtd_praticas_por_etapa: qtdPraticasPorEtapa,
        })
        .eq('id', classData.id);

      if (updateErr) throw updateErr;
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar alterações.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-md">
      <h2 className="mb-4 text-base font-semibold text-stone-900">Editar turma</h2>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-stone-500">
          Disciplina
          <input
            className="input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-stone-500">
            Peso da Prova
            <input
              type="number"
              step="0.1"
              className="input"
              value={pesoProva}
              onChange={(e) => setPesoProva(Number(e.target.value))}
              onBlur={(e) => setPesoProva(Number(Number(e.target.value).toFixed(1)))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-stone-500">
            Peso do Laboratório
            <input
              type="number"
              step="0.1"
              className="input"
              value={pesoLab}
              onChange={(e) => setPesoLab(Number(e.target.value))}
              onBlur={(e) => setPesoLab(Number(Number(e.target.value).toFixed(1)))}
            />
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-stone-500">TRs por etapa</p>
          <div className="grid grid-cols-4 gap-2">
            {qtdTrPorEtapa.map((qtd, i) => (
              <input
                key={i}
                type="number"
                min={0}
                className="input text-center"
                value={qtd}
                onChange={(e) => {
                  const next = [...qtdTrPorEtapa];
                  next[i] = Number(e.target.value);
                  setQtdTrPorEtapa(next);
                }}
              />
            ))}
          </div>
        </div>

        {classData.tem_laboratorio && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-stone-500">Práticas de lab por etapa</p>
            <div className="grid grid-cols-4 gap-2">
              {qtdPraticasPorEtapa.map((qtd, i) => (
                <input
                  key={i}
                  type="number"
                  min={0}
                  className="input text-center"
                  value={qtd}
                  onChange={(e) => {
                    const next = [...qtdPraticasPorEtapa];
                    next[i] = Number(e.target.value);
                    setQtdPraticasPorEtapa(next);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {(trReduzido || praticasReduzidas) && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            Você está reduzindo a quantidade de {trReduzido && praticasReduzidas ? 'TRs e práticas' : trReduzido ? 'TRs' : 'práticas'} de alguma etapa. Notas já lançadas nas colunas removidas não serão apagadas, mas deixarão de aparecer na grade — para recuperá-las, aumente o número novamente.
          </p>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="mt-5 flex gap-3">
        <button
          onClick={onClose}
          disabled={saving}
          className="flex-1 rounded-xl border border-stone-300 bg-white py-2.5 text-sm font-medium text-stone-600 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-xl bg-emerald-700 py-2.5 text-sm font-medium text-white active:bg-emerald-800 disabled:opacity-60"
        >
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </Modal>
  );
}
