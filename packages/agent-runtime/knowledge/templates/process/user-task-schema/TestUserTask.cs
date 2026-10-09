namespace BPMSoft.Core.Process.Configuration
{
	using System;
	using BPMSoft.Core.Process;
	public partial class TestUserTask
	{
		protected override bool InternalExecute(ProcessExecutingContext context)
		{
			string extra = string.IsNullOrEmpty(TestExtra) ? "<пусто>" : TestExtra;
			var entity = UserConnection.EntitySchemaManager.GetInstanceByName("TestProcEntity").CreateEntity(UserConnection);
			entity.SetDefColumnValues();
			entity.SetColumnValue("Name", "Шаг 18: действие v2 получило " + TestText + ", доп: " + extra);
			entity.SetColumnValue("Amount", TestNumber);
			entity.SetColumnValue("Sum", 18m);
			entity.Save();
			TestResult = "обработано v2: " + TestText + " / " + TestNumber + " / " + extra;
			return true;
		}
	}
}
