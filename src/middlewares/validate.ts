import {validationResult} from 'express-validator';
import {Request, Response} from 'express';
import * as _ from 'lodash';
import {Failure, FailureError} from "../type/pinner";

export function validate(validations: any[]) {
  return async (req: Request, res: Response, next: any) => {
    for (const validation of validations) {
      const result = await validation.run(req);
      if (result.errors.length) break;
    }
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
    const reason = _.head(errors.array()).msg as string;
    res.status(400).json(new Failure(new FailureError(reason, reason)));
  };
}
