import { NgComponentOutlet } from '@angular/common';
import { Component, input, type Type } from '@angular/core';

@Component({
  selector: 'button[app-settings-action]',
  imports: [NgComponentOutlet],
  templateUrl: './settings-action.html',
  styleUrl: './settings-action.css',
  host: {
    type: 'button',
  },
})
export class SettingsAction {
  readonly label = input.required<string>();
  readonly detail = input.required<string>();
  readonly icon = input.required<Type<unknown>>();
}
