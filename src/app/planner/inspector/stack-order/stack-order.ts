import { Component, inject } from '@angular/core';
import { PlannerStore } from '../../../core/planner-store';

@Component({
  selector: 'app-stack-order',
  templateUrl: './stack-order.html',
  styleUrl: './stack-order.css',
})
export class StackOrder {
  protected readonly store = inject(PlannerStore);
}
