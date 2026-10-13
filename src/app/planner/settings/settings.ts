import {
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
  type Type,
} from '@angular/core';
import {
  MsrCloseIconComponent,
  MsrDownloadIconComponent,
  MsrFolderOpenIconComponent,
  MsrImageIconComponent,
  MsrPrintIconComponent,
  MsrSaveIconComponent,
  MsrSettingsIconComponent,
} from '@captains-chest/material-symbols-rounded-icons';
import { MsrfSettingsIconComponent } from '@captains-chest/material-symbols-rounded-icons-filled';
import { MAX_HELPER_SPACING_METERS } from '../../core/helper-grid';
import { exportFilename } from '../../core/plan-export';
import { downloadBlob, printPlan, svgToPng } from '../../core/plan-raster';
import { PlannerStore } from '../../core/planner-store';
import {
  displayToMeters,
  formatDisplayNumber,
  inputStep,
  metersToDisplay,
  roundMetersForDisplay,
} from '../../core/units';
import { SettingsAction } from './settings-action/settings-action';

/** Longest side of the print image, in CSS pixels. */
const PRINT_LONG_SIDE_PX = 1400;

interface SettingsFileAction {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly icon: Type<unknown>;
  readonly run: () => void;
}

@Component({
  selector: 'app-settings',
  imports: [
    MsrCloseIconComponent,
    MsrSettingsIconComponent,
    MsrfSettingsIconComponent,
    SettingsAction,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  protected readonly store = inject(PlannerStore);
  // Angular cannot emit viewChild queries for ES # private fields.
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly imageInput = viewChild<ElementRef<HTMLInputElement>>('imageInput');
  private readonly projectInput = viewChild<ElementRef<HTMLInputElement>>('projectInput');

  protected readonly _opened = signal(false);
  protected readonly _notice = signal<string | null>(null);
  protected readonly _gridDisplay = computed(() =>
    formatDisplayNumber(this.store.gridSpacingMeters(), this.store.lengthUnit()),
  );
  /** Field minimum matches this step, so the spinner stays on the displayed series. */
  protected readonly _gridInputStep = computed(() => inputStep(this.store.lengthUnit()));
  protected readonly _gridMax = computed(() =>
    metersToDisplay(MAX_HELPER_SPACING_METERS, this.store.lengthUnit()),
  );
  protected readonly _fileActions: readonly SettingsFileAction[] = [
    {
      id: 'import-image',
      label: 'Import image',
      detail: 'Use a scan or photo as the plan background',
      icon: MsrImageIconComponent,
      run: () => this.#pickImage(),
    },
    {
      id: 'import-project',
      label: 'Import project',
      detail: 'Open a previously exported project file',
      icon: MsrFolderOpenIconComponent,
      run: () => this.#pickProject(),
    },
    {
      id: 'export',
      label: 'Export',
      detail: 'Download the plan, image, and scale',
      icon: MsrDownloadIconComponent,
      run: () => this.#exportProject(),
    },
    {
      id: 'save-png',
      label: 'Save PNG',
      detail: 'Download the plan as a PNG image',
      icon: MsrSaveIconComponent,
      run: () => void this.#savePng(),
    },
    {
      id: 'print',
      label: 'Print / PDF',
      detail: 'Print the plan, or choose Save as PDF in the print dialog',
      icon: MsrPrintIconComponent,
      run: () => void this.#print(),
    },
  ];

  protected _open(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) {
      return;
    }
    this._notice.set(null);
    this._opened.set(true);
    dialog.showModal();
  }

  protected _close(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) {
      dialog.close();
      return;
    }
    this._opened.set(false);
  }

  protected _onDialogClose(): void {
    this._opened.set(false);
  }

  protected _onDialogClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this._close();
    }
  }

  protected _onDialogKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Alt') {
      event.preventDefault();
    }
    event.stopPropagation();
  }

  protected _setGridSpacing(event: Event): void {
    const input = event.target as HTMLInputElement;
    const unit = this.store.lengthUnit();
    const typed = displayToMeters(Number(input.value), unit);
    const meters = roundMetersForDisplay(typed, unit);
    if (!Number.isFinite(meters) || meters <= 0) {
      input.value = this._gridDisplay();
      return;
    }
    this.store.setGridSpacing(meters);
    input.value = this._gridDisplay();
  }

  protected async _onImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    input.value = '';
    if (!file) {
      return;
    }
    try {
      await this.store.importImageFile(file);
      this._close();
    } catch {
      this.#report('Could not import that image.');
    }
  }

  protected async _onProject(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    input.value = '';
    if (!file) {
      return;
    }
    try {
      await this.store.importProjectFile(file);
      this._close();
    } catch {
      this.#report('Could not import that project file.');
    }
  }

  #pickImage(): void {
    this.imageInput()?.nativeElement.click();
  }

  #pickProject(): void {
    this.projectInput()?.nativeElement.click();
  }

  #exportProject(): void {
    const { filename, json } = this.store.exportProject();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    this.#report('Project exported.');
  }

  async #savePng(): Promise<void> {
    try {
      const blob = await svgToPng(this.store.renderPlan());
      downloadBlob(blob, exportFilename(this.store.plan().name, 'png'));
      this.#report('PNG saved.');
    } catch {
      this.#report('Could not create the PNG.');
    }
  }

  async #print(): Promise<void> {
    try {
      await printPlan(
        this.store.renderPlan({ longSidePx: PRINT_LONG_SIDE_PX }),
        this.store.plan().name,
      );
      this.#report('Print dialog opened.');
    } catch {
      this.#report('Could not open the print dialog.');
    }
  }

  #report(message: string): void {
    this._notice.set(message);
    this.store.setStatus(message);
  }
}
