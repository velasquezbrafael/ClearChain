'use client';

import { useState } from 'react';
import type { WalletAnalysis } from '@/types';

interface ExportButtonProps {
  analysis: WalletAnalysis;
  narrative: string | null;
  sarDraft: string | null;
}

const SIGNAL_LABELS: Record<string, string> = {
  ofac_match: 'OFAC MATCH',
  mixer_interaction: 'MIXER INTERACTION',
  rapid_fund_movement: 'RAPID FUND MOVEMENT',
  high_risk_counterparty: 'HIGH-RISK COUNTERPARTY',
  volume_anomaly: 'VOLUME ANOMALY',
  community_red_flags: 'COMMUNITY RED FLAGS',
};

function riskRGB(level: string): [number, number, number] {
  if (level === 'CRITICAL') return [255, 59, 59];
  if (level === 'HIGH') return [255, 140, 0];
  if (level === 'MEDIUM') return [255, 214, 10];
  return [0, 255, 136];
}

function confidenceRGB(c: number): [number, number, number] {
  if (c >= 0.85) return [255, 59, 59];
  if (c >= 0.65) return [255, 140, 0];
  if (c >= 0.40) return [255, 214, 10];
  return [136, 146, 164];
}

export default function ExportButton({ analysis, narrative, sarDraft }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [hovered, setHovered] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const { jsPDF } = await import('jspdf');

      const W = 210;
      const H = 297;
      const M = 18;
      const CW = W - M * 2;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // ── Color constants ──
      const BG:   [number, number, number] = [3, 4, 10];
      const TXT:  [number, number, number] = [240, 244, 255];
      const SEC:  [number, number, number] = [136, 146, 164];
      const DIM:  [number, number, number] = [61, 74, 92];
      const GRN:  [number, number, number] = [0, 255, 136];

      const TOTAL_PAGES = 5;

      function setupPage(pageNum: number) {
        // Background
        doc.setFillColor(...BG);
        doc.rect(0, 0, W, H, 'F');

        // Watermark (barely visible diagonal text)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(20, 26, 44);
        doc.text('CLEARCHAIN — CONFIDENTIAL DRAFT', W / 2, H / 2, { angle: 45, align: 'center' });

        // Nav bar line
        doc.setFillColor(8, 11, 20);
        doc.rect(0, 0, W, 14, 'F');

        // Logo
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...GRN);
        doc.text('CLEARCHAIN', M, 9);

        // Page number
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...DIM);
        doc.text(`${pageNum} / ${TOTAL_PAGES}`, W - M, 9, { align: 'right' });

        // Header rule
        doc.setDrawColor(...DIM);
        doc.setLineWidth(0.15);
        doc.line(M, 13, W - M, 13);

        // Footer
        doc.setFontSize(6.5);
        doc.setTextColor(...DIM);
        doc.text('Not a filed SAR — for compliance officer review only', M, H - 8);
        doc.text(`ClearChain v1  ·  ${new Date().toISOString().split('T')[0]}`, W - M, H - 8, { align: 'right' });

        // Footer rule
        doc.setDrawColor(...DIM);
        doc.line(M, H - 12, W - M, H - 12);
      }

      // ── Helper to draw a section label ──
      function sectionLabel(text: string, y: number) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...DIM);
        doc.text(text, M, y);
        return y + 3.5;
      }

      // ── PAGE 1: Executive Summary ────────────────────────────────────────────
      setupPage(1);

      let y = 22;

      // Page title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...TXT);
      doc.text('WALLET ANALYSIS REPORT', M, y);
      y += 8;

      // Wallet address
      doc.setFont('courier', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...TXT);
      doc.text(analysis.address, M, y);
      y += 5;

      // Meta
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...SEC);
      doc.text(
        `Analyzed: ${new Date(analysis.analyzedAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}   ·   Ethereum Mainnet   ·   ${analysis.transactions.length} transactions`,
        M, y
      );
      y += 8;

      // Thin rule
      doc.setDrawColor(20, 26, 44);
      doc.line(M, y, W - M, y);
      y += 10;

      // Risk score (huge)
      const rColor = riskRGB(analysis.riskScore.level);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(80);
      doc.setTextColor(...rColor);
      doc.text(String(analysis.riskScore.total), M, y + 42);

      // Level badge area (right of score)
      const badgeX = M + 58;
      doc.setFontSize(18);
      doc.setTextColor(...rColor);
      doc.text(`${analysis.riskScore.level} RISK`, badgeX, y + 16);

      doc.setFontSize(9);
      doc.setTextColor(...DIM);
      doc.text('/ 100', badgeX, y + 23);

      // OFAC status
      const ofacColor: [number, number, number] = analysis.ofacResult.matched ? [255, 59, 59] : [0, 255, 136];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...ofacColor);
      doc.text(
        analysis.ofacResult.matched
          ? `OFAC SDN: MATCH — ${analysis.ofacResult.matchedEntity ?? 'Sanctioned Entity'}`
          : 'OFAC SDN: CLEAR',
        badgeX, y + 31
      );

      y += 52;

      // Risk description
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...SEC);
      const DESCRIPTIONS: Record<string, string> = {
        CRITICAL: 'Immediate escalation required. Strong indicators of sanctions exposure. SAR filing should be considered.',
        HIGH: 'Significant red flags detected. Enhanced due diligence and source-of-funds inquiry required.',
        MEDIUM: 'Elevated risk indicators present. EDD warranted. Monitor for continued activity.',
        LOW: 'No significant risk indicators detected. Routine monitoring applies.',
      };
      const descLines = doc.splitTextToSize(DESCRIPTIONS[analysis.riskScore.level] ?? '', CW);
      doc.text(descLines, M, y);
      y += descLines.length * 4.5 + 10;

      // Stats row
      doc.setDrawColor(20, 26, 44);
      doc.line(M, y, W - M, y);
      y += 8;

      const stats = [
        { label: 'TRANSACTIONS', value: String(analysis.transactions.length) },
        { label: 'SIGNALS TRIGGERED', value: String(analysis.riskScore.signals.filter(s => s.triggered).length) },
        { label: 'TYPOLOGIES MATCHED', value: String(analysis.typologies.filter(t => t.triggered).length) },
      ];
      const statColW = CW / stats.length;

      for (let i = 0; i < stats.length; i++) {
        const x = M + i * statColW;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...DIM);
        doc.text(stats[i].label, x, y);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(...TXT);
        doc.text(stats[i].value, x, y + 10);
      }

      // ── PAGE 2: Signal Breakdown ─────────────────────────────────────────────
      doc.addPage();
      setupPage(2);
      y = 22;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...TXT);
      doc.text('SIGNAL BREAKDOWN', M, y);
      y += 6;

      y = sectionLabel('Risk signals evaluated against on-chain behavior patterns', y);
      y += 6;

      // Column positions
      const C = {
        dot:    M,
        name:   M + 7,
        score:  M + 95,
        weight: M + 110,
        detail: M + 124,
      };

      // Table header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...DIM);
      doc.text('', C.dot, y);
      doc.text('SIGNAL', C.name, y);
      doc.text('SCORE', C.score, y);
      doc.text('MAX', C.weight, y);
      doc.text('DETAIL', C.detail, y);
      y += 2;

      doc.setDrawColor(...DIM);
      doc.line(M, y, W - M, y);
      y += 5;

      const sorted = [...analysis.riskScore.signals].sort((a, b) => {
        if (a.triggered && !b.triggered) return -1;
        if (!a.triggered && b.triggered) return 1;
        return b.weight - a.weight;
      });

      for (const signal of sorted) {
        // Indicator dot
        if (signal.triggered) {
          doc.setFillColor(...GRN);
          doc.circle(C.dot + 1.5, y - 1, 1.5, 'F');
        } else {
          doc.setDrawColor(...DIM);
          doc.circle(C.dot + 1.5, y - 1, 1.5, 'S');
        }

        // Signal name
        doc.setFont('helvetica', signal.triggered ? 'bold' : 'normal');
        doc.setFontSize(8.5);
        signal.triggered ? doc.setTextColor(...TXT) : doc.setTextColor(...DIM);
        doc.text(SIGNAL_LABELS[signal.name] ?? signal.name.replace(/_/g, ' ').toUpperCase(), C.name, y);

        // Score
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        if (signal.triggered) {
          doc.setTextColor(255, 140, 0);
        } else {
          doc.setTextColor(...DIM);
        }
        doc.text(`+${signal.triggered ? signal.score : 0}`, C.score, y);

        // Weight
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...DIM);
        doc.text(`/${signal.weight}`, C.weight, y);

        // Detail (wrap to 2 lines max)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...SEC);
        const detailLines = doc.splitTextToSize(signal.detail || '—', W - M - C.detail);
        doc.text(detailLines.slice(0, 2), C.detail, y);

        y += Math.max(7, detailLines.length > 1 ? 11 : 7);

        // Row separator
        doc.setDrawColor(12, 16, 28);
        doc.setLineWidth(0.1);
        doc.line(M, y - 2, W - M, y - 2);
        doc.setLineWidth(0.15);
      }

      // ── PAGE 3: AML Typologies ───────────────────────────────────────────────
      doc.addPage();
      setupPage(3);
      y = 22;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...TXT);
      doc.text('AML TYPOLOGIES', M, y);
      y += 6;

      y = sectionLabel('FATF / FinCEN pattern matching results', y);
      y += 8;

      const triggeredTypologies = analysis.typologies.filter(t => t.triggered).sort((a, b) => b.confidence - a.confidence);

      if (triggeredTypologies.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...DIM);
        doc.text('No AML typologies matched against this address.', M, y);
      } else {
        for (const typ of triggeredTypologies) {
          if (y > H - 35) { doc.addPage(); setupPage(3); y = 22; }

          const pct = Math.round(typ.confidence * 100);
          const tColor = confidenceRGB(typ.confidence);

          // Name + confidence bar
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(...TXT);
          doc.text(typ.name.toUpperCase(), M, y);

          // Confidence badge
          doc.setFillColor(...tColor);
          doc.roundedRect(W - M - 28, y - 5, 28, 7, 1, 1, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(3, 4, 10);
          doc.text(`${pct}%  CONFIDENCE`, W - M - 14, y - 0.5, { align: 'center' });

          y += 5;

          // FATF reference
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(...DIM);
          doc.text(typ.fatfReference, M, y);
          y += 5;

          // Rationale
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(...SEC);
          const ratLines = doc.splitTextToSize(typ.rationale, CW);
          doc.text(ratLines, M, y);
          y += ratLines.length * 4.3 + 4;

          // Progress bar
          const barW = CW;
          const barH = 2;
          doc.setFillColor(20, 26, 44);
          doc.rect(M, y, barW, barH, 'F');
          doc.setFillColor(...tColor);
          doc.rect(M, y, barW * typ.confidence, barH, 'F');
          y += barH + 10;

          // Separator
          doc.setDrawColor(20, 26, 44);
          doc.line(M, y - 5, W - M, y - 5);
        }
      }

      // ── PAGE 4: AI Narrative ─────────────────────────────────────────────────
      doc.addPage();
      setupPage(4);
      y = 22;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...TXT);
      doc.text('AI NARRATIVE', M, y);
      y += 6;

      y = sectionLabel('Generated by Claude Haiku — chain-of-custody intelligence briefing', y);
      y += 8;

      // Attribution
      doc.setFillColor(8, 11, 20);
      doc.rect(M, y - 3, CW, 8, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...DIM);
      doc.text(`Address: ${analysis.address}  ·  ${new Date(analysis.analyzedAt).toLocaleString()}`, M + 3, y + 1.5);
      y += 12;

      if (narrative && !narrative.toLowerCase().includes('generation failed')) {
        doc.setFont('times', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...TXT);

        const narrativeLines = doc.splitTextToSize(narrative, CW);
        for (const line of narrativeLines) {
          if (y > H - 25) { doc.addPage(); setupPage(4); y = 22; }
          doc.text(line, M, y);
          y += 5;
        }
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...DIM);
        doc.text('Narrative generation failed or unavailable.', M, y);
      }

      // ── PAGE 5: SAR Draft ────────────────────────────────────────────────────
      doc.addPage();
      setupPage(5);
      y = 22;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...TXT);
      doc.text('SAR DRAFT', M, y);
      y += 6;

      // Warning banner
      doc.setFillColor(30, 12, 8);
      doc.rect(M, y - 1, CW, 9, 'F');
      doc.setDrawColor(255, 59, 59);
      doc.setLineWidth(0.5);
      doc.rect(M, y - 1, CW, 9);
      doc.setLineWidth(0.15);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 59, 59);
      doc.text('FOR COMPLIANCE OFFICER REVIEW ONLY — NOT A FILED SAR', M + 3, y + 4);
      y += 14;

      if (sarDraft && !sarDraft.toLowerCase().includes('generation failed')) {
        const sarLines = sarDraft.split('\n');
        doc.setFont('courier', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...SEC);

        for (const line of sarLines) {
          if (y > H - 20) { doc.addPage(); setupPage(5); y = 22; }
          const wrapped = doc.splitTextToSize(line || ' ', CW);
          doc.text(wrapped, M, y);
          y += wrapped.length * 3.8;
        }
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...DIM);
        doc.text('SAR draft generation failed or unavailable.', M, y);
      }

      // Save
      const filename = `clearchain-${analysis.address.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '6px 14px',
        border: `1px solid ${hovered ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 2,
        background: hovered ? 'rgba(0,255,136,0.05)' : 'none',
        fontFamily: 'var(--font-jetbrains-mono)',
        fontSize: 10,
        letterSpacing: '0.1em',
        color: exporting ? 'var(--text-dim)' : (hovered ? '#00ff88' : 'var(--text-secondary)'),
        cursor: exporting ? 'wait' : 'pointer',
        transition: 'all 0.2s',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
      aria-label="Export analysis as PDF"
    >
      {exporting ? (
        <>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              border: '1px solid var(--text-dim)',
              borderTopColor: '#00ff88',
              animation: 'spin 0.9s linear infinite',
            }}
          />
          EXPORTING...
        </>
      ) : (
        'EXPORT PDF →'
      )}
    </button>
  );
}
