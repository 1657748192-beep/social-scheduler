export default function DataDeletionPage() {
  return (
    <main className="legal-page">
      <section className="legal-card">
        <h1>数据删除说明</h1>
        <p>最后更新：2026-06-27</p>
        <p>用户可以通过以下方式请求删除 Social Scheduler 中保存的账号和内容数据。</p>
        <h2>自助删除</h2>
        <p>
          登录系统后，进入控制台，找到已连接的社交账号并点击“解绑”。解绑会移除该账号的访问令牌，
          后续系统将无法继续访问或发布到该社交账号。
        </p>
        <h2>邮件请求</h2>
        <p>
          如需删除工作区、草稿、媒体素材或账号数据，请发送邮件至 1657748192@qq.com，并提供注册邮箱和需要删除的数据范围。
          我们会在收到请求后处理。
        </p>
        <h2>Facebook 数据删除</h2>
        <p>你也可以在 Facebook 账号设置中移除本应用授权。移除后，本系统将无法继续访问 Facebook 授权数据。</p>
      </section>
    </main>
  );
}
