package pdv

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// WailsPDVBridge representa a ponte que a aplicação Wails Desktop expõe para a UI em JS/TS.
type WailsPDVBridge struct {
	LocalSQLitePath string
	ContingencyMode bool
}

func NewWailsPDVBridge(dbPath string) *WailsPDVBridge {
	return &WailsPDVBridge{
		LocalSQLitePath: dbPath,
		ContingencyMode: false,
	}
}

// 1. SyncCatalogToLocalSQLite atualiza as tabelas locais do SQLite com o catálogo baixado do ERP central
func (b *WailsPDVBridge) SyncCatalogToLocalSQLite(catalogJSON string) (string, error) {
	fmt.Printf("[WAILS DESKTOP] Recebendo catálogo de produtos do servidor. Tamanho: %d bytes\n", len(catalogJSON))
	fmt.Println("[WAILS DESKTOP] Iniciando gravação na tabela local 'produtos_grade' do SQLite...")
	
	// Simulação de inserção/upsert local no SQLite
	time.Sleep(100 * time.Millisecond)
	
	fmt.Println("[WAILS DESKTOP] Catálogo sincronizado localmente. Pronto para operação Offline-First!")
	return "Catálogo local sincronizado com sucesso no SQLite local.", nil
}

// 2. SaveOfflineVenda registra a venda localmente no SQLite quando o caixa está operando sem internet
func (b *WailsPDVBridge) SaveOfflineVenda(total float64, formaPagamento string, itensJson string) (string, error) {
	b.ContingencyMode = true
	offlineUUID := uuid.New().String()

	fmt.Println("[WAILS DESKTOP] [ALERTA] Caixa operando em modo CONTINGÊNCIA (Sem Internet).")
	fmt.Printf("[WAILS DESKTOP] Gravando venda localmente no SQLite com UUID Offline: %s\n", offlineUUID)
	fmt.Printf("[WAILS DESKTOP] Total da venda: R$ %.2f | Forma de Pagamento: %s\n", total, formaPagamento)

	// Simula a gravação nas tabelas locais 'vendas_offline' e 'venda_itens_offline' do SQLite
	time.Sleep(50 * time.Millisecond)

	return offlineUUID, nil
}

// 3. GetPendingContingencyList extrai as vendas pendentes de sincronização do SQLite local para envio
func (b *WailsPDVBridge) GetPendingContingencyList() (string, error) {
	fmt.Println("[WAILS DESKTOP] Buscando vendas pendentes de sincronização na base de dados SQLite...")

	// Simula a listagem de registros locais não sincronizados
	itensMock := []OfflineVendaItemRequest{
		{
			ProdutoGradeID: uuid.New().String(),
			Quantidade:     2,
			PrecoUnitario:  49.90,
		},
	}
	
	vendasMock := []OfflineVendaRequest{
		{
			OfflineUUID:    uuid.New().String(),
			Total:          99.80,
			FormaPagamento: "PIX",
			ChaveNFe:       "35260721111111111111550010000000012345678901",
			Itens:          itensMock,
		},
	}

	bytes, _ := json.Marshal(vendasMock)
	return string(bytes), nil
}

// 4. ClearSyncedLocalVendas remove ou marca como sincronizadas as vendas no SQLite local
func (b *WailsPDVBridge) ClearSyncedLocalVendas(syncedUUIDs []string) error {
	fmt.Printf("[WAILS DESKTOP] Limpando %d registros sincronizados do SQLite local...\n", len(syncedUUIDs))
	for _, id := range syncedUUIDs {
		fmt.Printf("[WAILS DESKTOP] Registro local removido da fila de contingência: %s\n", id)
	}
	b.ContingencyMode = false
	return nil
}
