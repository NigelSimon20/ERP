const url = 'http://localhost:3004';

async function run() {
  try {
    const devLogin = await fetch(`${url}/api/auth/dev-login?uid=usr-local-admin`, {
      redirect: 'manual',
    });
    console.log('dev-login status:', devLogin.status);
    const setCookie = devLogin.headers.get('set-cookie');
    console.log('set-cookie present:', !!setCookie);
    if (!setCookie) {
      console.log('dev-login headers:', Array.from(devLogin.headers.entries()));
      return;
    }

    const cookie = setCookie.split(/;\s*/)[0];

    const me = await fetch(`${url}/api/auth/me`, { headers: { cookie } });
    console.log('/api/auth/me status:', me.status);
    const meBody = await me.text();
    console.log('/api/auth/me body:', meBody.slice(0, 500));

    const exec = await fetch(`${url}/api/dashboard/executive`, { headers: { cookie } });
    console.log('/api/dashboard/executive status:', exec.status);
    const execBody = await exec.text();
    console.log('/api/dashboard/executive body:', execBody.slice(0, 500));
  } catch (err) {
    console.error('error:', err);
  }
}

run();
