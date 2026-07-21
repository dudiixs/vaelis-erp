package fiscal

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"erp/internal/platform/database/db"
)

type FiscalMessagingWorker struct {
	pool    *pgxpool.Pool
	queries *db.Queries
	stop    chan struct{}
}

func NewFiscalMessagingWorker(pool *pgxpool.Pool) *FiscalMessagingWorker {
	return &FiscalMessagingWorker{
		pool:    pool,
		queries: db.New(pool),
		stop:    make(chan struct{}),
	}
}

func (w *FiscalMessagingWorker) Start() {
	ticker := time.NewTicker(3 * time.Second)
	go func() {
		for {
			select {
			case <-ticker.C:
				w.processarFilaFiscal()
			case <-w.stop:
				ticker.Stop()
				return
			}
		}
	}()
}

func (w *FiscalMessagingWorker) Stop() {
	close(w.stop)
}

func (w *FiscalMessagingWorker) processarFilaFiscal() {
	ctx := context.Background()
	notasPendentes, err := w.queries.ListNotasPendentesFila(ctx)
	if err != nil || len(notasPendentes) == 0 {
		return
	}

	for _, n := range notasPendentes {
		tx, err := w.pool.Begin(ctx)
		if err != nil {
			continue
		}
		qtx := w.queries.WithTx(tx)

		valor, _ := n.ValorTotal.Float64Value()

		// Regra de simulação de erro: se valor for exatamente R$ 999.00, simula falha do SEFAZ (Rejeição)
		if valor.Float64 == 999.00 {
			_, _ = qtx.UpdateFilaStatus(ctx, db.UpdateFilaStatusParams{
				ID:      n.ID,
				Status:  "ERRO",
				ErroLog: pgtype.Text{String: "Rejeição SEFAZ 215: Falha no schema XML da Nota Fiscal.", Valid: true},
			})
			_ = tx.Commit(ctx)
			continue
		}

		// Simula processamento com sucesso: atualiza nota para AUTORIZADA
		_, _ = qtx.UpdateNotaFiscalStatus(ctx, db.UpdateNotaFiscalStatusParams{
			ID:     n.NotaFiscalID,
			Status: "AUTORIZADA",
		})

		// Marca item da fila como ENVIADO
		_, _ = qtx.UpdateFilaStatus(ctx, db.UpdateFilaStatusParams{
			ID:      n.ID,
			Status:  "ENVIADO",
			ErroLog: pgtype.Text{Valid: false},
		})

		_ = tx.Commit(ctx)
		fmt.Printf("[FISCAL WORKER] Nota Fiscal ID %s processada assincronamente pela Mensageria Fiscal com sucesso!\n", uuid.UUID(n.NotaFiscalID.Bytes).String())
	}
}
