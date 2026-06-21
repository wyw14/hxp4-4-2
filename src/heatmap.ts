import type { Signal, WeatherOffset } from './types';
import { calculateMatchStrength, lerp } from './signal';

export interface HeatmapCell {
  element: HTMLElement;
  vhf: number;
  uhf: number;
  strength: number;
}

export class Heatmap {
  private gridElement: HTMLElement;
  private antennaElement: HTMLElement;
  private cells: HeatmapCell[][] = [];
  private signals: Signal[] = [];
  private weatherOffset: WeatherOffset = { vhfShift: 0, uhfShift: 0, antennaShift: 0 };
  private currentAntenna: number = 180;
  private currentVhf: number = 100;
  private currentUhf: number = 400;
  private onCellClick: (vhf: number, uhf: number) => void;

  private readonly COLS = 16;
  private readonly ROWS = 12;
  private readonly VHF_MIN = 0;
  private readonly VHF_MAX = 250;
  private readonly UHF_MIN = 100;
  private readonly UHF_MAX = 800;

  constructor(
    gridElement: HTMLElement,
    antennaElement: HTMLElement,
    signals: Signal[],
    onCellClick: (vhf: number, uhf: number) => void
  ) {
    this.gridElement = gridElement;
    this.antennaElement = antennaElement;
    this.signals = signals;
    this.onCellClick = onCellClick;
    this.createGrid();
  }

  private createGrid(): void {
    this.gridElement.innerHTML = '';
    this.cells = [];

    for (let row = 0; row < this.ROWS; row++) {
      const rowCells: HeatmapCell[] = [];
      for (let col = 0; col < this.COLS; col++) {
        const vhf = this.VHF_MIN + (col / (this.COLS - 1)) * (this.VHF_MAX - this.VHF_MIN);
        const uhf = this.UHF_MIN + ((this.ROWS - 1 - row) / (this.ROWS - 1)) * (this.UHF_MAX - this.UHF_MIN);

        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.dataset.row = row.toString();
        cell.dataset.col = col.toString();
        cell.title = `VHF: ${Math.round(vhf)}  UHF: ${Math.round(uhf)}`;

        cell.addEventListener('click', () => {
          this.onCellClick(vhf, uhf);
        });

        this.gridElement.appendChild(cell);
        rowCells.push({ element: cell, vhf, uhf, strength: 0 });
      }
      this.cells.push(rowCells);
    }
  }

  public setWeatherOffset(offset: WeatherOffset): void {
    this.weatherOffset = offset;
  }

  public setCurrentTuning(vhf: number, uhf: number, antenna: number): void {
    this.currentVhf = vhf;
    this.currentUhf = uhf;
    this.currentAntenna = antenna;
    this.antennaElement.textContent = `${Math.round(antenna)}°`;
  }

  public update(): void {
    let maxStrength = 0;
    const strengths: number[][] = [];

    for (let row = 0; row < this.ROWS; row++) {
      strengths[row] = [];
      for (let col = 0; col < this.COLS; col++) {
        const cell = this.cells[row][col];
        const strength = this.calculateCombinedStrength(cell.vhf, cell.uhf);
        strengths[row][col] = strength;
        if (strength > maxStrength) maxStrength = strength;
      }
    }

    for (let row = 0; row < this.ROWS; row++) {
      for (let col = 0; col < this.COLS; col++) {
        const cell = this.cells[row][col];
        const normalized = maxStrength > 0 ? strengths[row][col] / maxStrength : 0;
        cell.strength = normalized;
        this.updateCellAppearance(cell, normalized);
      }
    }

    this.updateCurrentCellHighlight();
  }

  private calculateCombinedStrength(vhf: number, uhf: number): number {
    let maxCombined = 0;

    for (const signal of this.signals) {
      let effectiveVhfRange: [number, number] = [...signal.vhfRange] as [number, number];
      let effectiveUhfRange: [number, number] = [...signal.uhfRange] as [number, number];
      let effectiveAntennaRange: [number, number] = [...signal.antennaAngle] as [number, number];

      if (signal.weatherAffected) {
        effectiveVhfRange = [
          effectiveVhfRange[0] + this.weatherOffset.vhfShift,
          effectiveVhfRange[1] + this.weatherOffset.vhfShift
        ];
        effectiveUhfRange = [
          effectiveUhfRange[0] + this.weatherOffset.uhfShift,
          effectiveUhfRange[1] + this.weatherOffset.uhfShift
        ];
        effectiveAntennaRange = [
          effectiveAntennaRange[0] + this.weatherOffset.antennaShift,
          effectiveAntennaRange[1] + this.weatherOffset.antennaShift
        ];
      }

      const vhfMatch = calculateMatchStrength(vhf, effectiveVhfRange, 12);
      const uhfMatch = calculateMatchStrength(uhf, effectiveUhfRange, 30);
      const antennaMatch = calculateMatchStrength(this.currentAntenna, effectiveAntennaRange, 25);

      const combined = (vhfMatch * 0.35 + uhfMatch * 0.35 + antennaMatch * 0.3) * signal.intensity;

      if (combined > maxCombined) {
        maxCombined = combined;
      }
    }

    return maxCombined;
  }

  private updateCellAppearance(cell: HeatmapCell, normalizedStrength: number): void {
    const element = cell.element;

    if (normalizedStrength < 0.05) {
      element.style.backgroundColor = '#0a150a';
      element.style.color = 'transparent';
      element.classList.remove('active');
      return;
    }

    const t = Math.pow(normalizedStrength, 0.6);

    const r = Math.round(lerp(10, 80, t));
    const g = Math.round(lerp(21, 200, t));
    const b = Math.round(lerp(10, 120, t));

    const bgColor = `rgb(${r}, ${g}, ${b})`;
    const glowColor = `rgba(${Math.round(r * 1.5)}, ${Math.round(g * 1.5)}, ${Math.round(b * 1.5)}, ${0.3 + t * 0.5})`;

    element.style.backgroundColor = bgColor;
    element.style.color = `rgb(${Math.round(r * 2)}, ${Math.round(g * 2)}, ${Math.round(b * 2)})`;

    if (normalizedStrength > 0.3) {
      element.classList.add('active');
      element.style.boxShadow = `0 0 ${4 + t * 8}px ${glowColor}, inset 0 0 4px rgba(255, 255, 255, ${0.1 + t * 0.3})`;
    } else {
      element.classList.remove('active');
      element.style.boxShadow = 'none';
    }
  }

  private updateCurrentCellHighlight(): void {
    for (let row = 0; row < this.ROWS; row++) {
      for (let col = 0; col < this.COLS; col++) {
        this.cells[row][col].element.classList.remove('current');
      }
    }

    const col = Math.round(((this.currentVhf - this.VHF_MIN) / (this.VHF_MAX - this.VHF_MIN)) * (this.COLS - 1));
    const row = this.ROWS - 1 - Math.round(((this.currentUhf - this.UHF_MIN) / (this.UHF_MAX - this.UHF_MIN)) * (this.ROWS - 1));

    const clampedCol = Math.max(0, Math.min(this.COLS - 1, col));
    const clampedRow = Math.max(0, Math.min(this.ROWS - 1, row));

    this.cells[clampedRow][clampedCol].element.classList.add('current');
  }
}
