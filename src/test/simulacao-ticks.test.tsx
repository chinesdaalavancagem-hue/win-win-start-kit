import {render,screen,fireEvent} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {SimulacaoFuturos} from '../components/platform/SimulacaoFuturos';
import {precosFuturos} from '../lib/platform/simulacao-futuros';
import {Platform} from '../components/platform/Platform';
import {defaultState} from '../lib/platform/engine';
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:vi.fn(async()=>({data:{session:null}}))}}}));
vi.mock('@/lib/auditoria-registro',()=>({registrarAuditoria:vi.fn(async()=>{})}));
it('calcula compra e venda com ticks inteiros para ouro e Nasdaq',()=>{
 expect(precosFuturos(3991.5,122,100,.1,true)).toEqual({alvo:4003.7,stop:3981.5});
 expect(precosFuturos(3991.5,122,100,.1,false)).toEqual({alvo:3979.3,stop:4001.5});
 expect(precosFuturos(20000,20,10,.25,true)).toEqual({alvo:20005,stop:19997.5});
 expect(precosFuturos(3991.55,122,100,.1,true)).toBeNull();
 expect(precosFuturos(3991.5,1.5,100,.1,true)).toBeNull();
});
it('exibe preços e permite inverter o lado sem tocar nos cards',()=>{
 render(<SimulacaoFuturos/>);
 fireEvent.change(screen.getByLabelText('Preço de entrada'),{target:{value:'3991,5'}});
 fireEvent.change(screen.getByLabelText('Alvo em ticks'),{target:{value:'122'}});
 expect(screen.getByText('4.003,70')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Direção'),{target:{value:'venda'}});
 expect(screen.getByText('3.979,30')).toBeInTheDocument();
});
it('edita ticks do alvo no card e abre simulação pelo menu',async()=>{
 const s=defaultState();s.activeTab='ouro';s.assets.ouro.days[0]!.mnq=4;
 render(<Platform leftMenuOpen load={async()=>JSON.stringify(s)} save={async()=>true} isAdmin officialAcceptedAt={null}/>);
 const ticks=await screen.findAllByLabelText('Alvo em ticks');
 fireEvent.change(ticks[0]!,{target:{value:'122'}});
 expect(screen.getAllByLabelText('Meta bruta $')[0]).toHaveValue('488');
 fireEvent.click(screen.getByRole('button',{name:'Simulação',hidden:true}));
 expect(screen.getByLabelText('Preço de entrada')).toBeInTheDocument();
});
