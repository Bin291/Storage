import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, mergeMap, of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { foldersActions } from './folders.actions';

@Injectable()
export class FoldersEffects {
  private readonly actions$ = inject(Actions);
  private readonly api = inject(ApiService);

  loadChildren$ = createEffect(() =>
    this.actions$.pipe(
      ofType(foldersActions.loadChildren),
      mergeMap(({ parentId }) =>
        this.api.folderChildren(parentId).pipe(
          map((children) => foldersActions.loadChildrenSuccess({ parentId, children })),
          catchError(() =>
            of(
              foldersActions.loadChildrenFailure({
                parentId,
                error: 'Không tải được danh sách thư mục',
              }),
            ),
          ),
        ),
      ),
    ),
  );
}
