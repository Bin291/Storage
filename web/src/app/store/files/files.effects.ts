import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, of, switchMap, timeout } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { filesActions } from './files.actions';

@Injectable()
export class FilesEffects {
  private readonly actions$ = inject(Actions);
  private readonly api = inject(ApiService);

  loadFiles$ = createEffect(() =>
    this.actions$.pipe(
      ofType(filesActions.loadFiles),
      // switchMap huỷ request cũ khi đổi lăng kính/sort dồn dập — tránh 2 kết
      // quả về cùng lúc và ghi đè lẫn nhau (đua kết quả).
      switchMap(({ params }) =>
        this.api.listFiles(params).pipe(
          timeout(15000),
          map((result) => filesActions.loadFilesSuccess({ result })),
          catchError(() =>
            of(
              filesActions.loadFilesFailure({
                error:
                  'Không tải được danh sách. Kiểm tra backend đã chạy chưa (cd apps → npm run api), rồi Thử lại.',
              }),
            ),
          ),
        ),
      ),
    ),
  );
}
