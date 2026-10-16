async page => {
  const trigger=page.getByRole('button',{name:'预览效果',exact:true}).nth(0);
  await trigger.click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'下一张',exact:true}).click();
  for(let i=0;i<8;i++){
    await page.keyboard.press('Tab');
    const inside=await dialog.evaluate(el=>el.contains(document.activeElement));
    if(!inside)throw Error('focus escaped modal after last carousel item, Tab '+i);
  }
  await dialog.getByRole('button',{name:'上一张',exact:true}).click();
  for(let i=0;i<8;i++){
    await page.keyboard.press('Shift+Tab');
    if(!await dialog.evaluate(el=>el.contains(document.activeElement)))throw Error('focus escaped modal after first carousel item');
  }
  await page.keyboard.press('Escape');
  if(await dialog.count())throw Error('Escape failed to close modal');
  if(!await trigger.evaluate(el=>el===document.activeElement))throw Error('focus was not restored to preview trigger');
  const overflow=await page.evaluate(()=>document.body.style.overflow);
  if(overflow==='hidden')throw Error('body remained scroll-locked after close');
  return 'KEYBOARD_OK: both endpoints, Tab/Shift+Tab containment, Escape, trigger focus and scroll restoration';
}
