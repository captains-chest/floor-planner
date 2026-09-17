import { Component } from '@angular/core';
import { Planner } from './planner/planner';

@Component({
  imports: [Planner],
  selector: 'app-root',
  styles: `
    :host {
      display: block;
      height: 100%;
    }
  `,
  template: `<app-planner />`,
})
export class App {}
