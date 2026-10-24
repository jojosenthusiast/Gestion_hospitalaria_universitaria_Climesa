import 'reflect-metadata';
import { REQUIRED_PERMISSION, RequirePermission } from '../src/auth/permission.decorator';

describe('RequirePermission', () => {
  it('stores the permission metadata used by the authorization guard', () => {
    class SampleController {
      @RequirePermission('pacientes.buscar')
      search(): void {}
    }

    expect(Reflect.getMetadata(REQUIRED_PERMISSION, SampleController.prototype.search)).toBe('pacientes.buscar');
  });
});
